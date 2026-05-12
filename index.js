const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 3001;
const dbName = process.env.DB_NAME || "RedLove";
const jwtSecret = process.env.API_SECRET_KEY;

const defaultOrigins = [
  "https://red-love-donation.web.app",
  "https://red-love-donation.firebaseapp.com",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];

const envOrigins = (process.env.CLIENT_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const allowedOrigins = [...new Set([...defaultOrigins, ...envOrigins])];

const buildLegacyMongoUri = () => {
  const username = process.env.DATABASE_ACCESS_USERNAME;
  const password = process.env.DATABASE_ACCESS_PASSWORD;

  if (!username || !password) return null;

  const encodedUsername = encodeURIComponent(username);
  const encodedPassword = encodeURIComponent(password);

  return `mongodb://${encodedUsername}:${encodedPassword}@ac-mxcrq0r-shard-00-00.zukg64l.mongodb.net:27017,ac-mxcrq0r-shard-00-01.zukg64l.mongodb.net:27017,ac-mxcrq0r-shard-00-02.zukg64l.mongodb.net:27017/?ssl=true&replicaSet=atlas-zsmeja-shard-0&authSource=admin&retryWrites=true&w=majority&appName=Cluster0`;
};

const mongoUri = process.env.MONGODB_URI || buildLegacyMongoUri();

const corsOptions = {
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(null, false);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
app.use(express.json({ limit: "1mb" }));

const asyncRoute = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

const sendAuthError = (res) => {
  res.status(401).send({ message: "Unauthorized access" });
};

const sendForbiddenError = (res) => {
  res.status(403).send({ message: "forbidden access" });
};

const getBearerToken = (req) => {
  const authHeader = req.headers.authorization || "";
  const [scheme, token] = authHeader.split(" ");
  return scheme === "Bearer" && token ? token : null;
};

const requireEnv = (value, name) => {
  if (!value) {
    const error = new Error(`${name} is not configured`);
    error.statusCode = 500;
    throw error;
  }
};

const toObjectId = (id) => {
  if (!ObjectId.isValid(id)) {
    const error = new Error("Invalid id");
    error.statusCode = 400;
    throw error;
  }

  return new ObjectId(id);
};

let mongoClient;
let mongoConnectionPromise;

const getMongoClient = async () => {
  requireEnv(mongoUri, "MONGODB_URI");

  if (!mongoClient) {
    mongoClient = new MongoClient(mongoUri, {
      serverSelectionTimeoutMS: 10000,
      serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
      },
    });
  }

  if (!mongoConnectionPromise) {
    mongoConnectionPromise = mongoClient.connect().catch((error) => {
      mongoConnectionPromise = null;
      throw error;
    });
  }

  await mongoConnectionPromise;
  return mongoClient;
};

const getCollections = async () => {
  const client = await getMongoClient();
  const db = client.db(dbName);

  return {
    users: db.collection("User"),
    blogs: db.collection("BlogsCollection"),
    donations: db.collection("createdDonation"),
    contacts: db.collection("ContactMessages"),
  };
};

const escapeRegex = (value = "") => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const requireString = (body, field) => {
  const value = body?.[field];
  if (typeof value !== "string" || !value.trim()) {
    const error = new Error(`${field} is required`);
    error.statusCode = 400;
    throw error;
  }
  return value.trim();
};

const requireEmail = (body, field = "email") => {
  const email = requireString(body, field).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    const error = new Error("Valid email is required");
    error.statusCode = 400;
    throw error;
  }
  return email;
};

const verifyToken = (req, res, next) => {
  try {
    requireEnv(jwtSecret, "API_SECRET_KEY");

    const token = getBearerToken(req);
    if (!token) {
      sendAuthError(res);
      return;
    }

    const decoded = jwt.verify(token, jwtSecret);
    req.decoded = decoded;
    next();
  } catch (error) {
    if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError") {
      sendAuthError(res);
      return;
    }

    next(error);
  }
};

const verifyRole = (roles) =>
  [
    verifyToken,
    asyncRoute(async (req, res, next) => {
      const { users } = await getCollections();
      const email = req.decoded?.email?.toLowerCase();
      const user = await users.findOne({ Email: email });

      if (user && roles.includes(user.Role)) {
        next();
        return;
      }

      sendForbiddenError(res);
    }),
  ];

const verifyAdmin = verifyRole(["Admin"]);
const verifyAdminVolunteer = verifyRole(["Admin", "Volunteer"]);

app.get("/", (req, res) => {
  res.send("Server responded");
});

app.get(
  "/health",
  asyncRoute(async (req, res) => {
    const health = {
      ok: true,
      service: "red-love-server",
      hasJwtSecret: Boolean(jwtSecret),
      hasMongoUri: Boolean(process.env.MONGODB_URI),
      hasMongoUserPassword: Boolean(
        process.env.DATABASE_ACCESS_USERNAME && process.env.DATABASE_ACCESS_PASSWORD
      ),
      allowedOrigins,
    };

    try {
      const client = await getMongoClient();
      await client.db("admin").command({ ping: 1 });
      res.send({ ...health, database: "connected" });
    } catch (error) {
      res.status(503).send({
        ...health,
        ok: false,
        database: "error",
        error: error.message,
      });
    }
  })
);

app.post(
  "/jwt",
  asyncRoute(async (req, res) => {
    requireEnv(jwtSecret, "API_SECRET_KEY");

    const user = req.body;
    const token = jwt.sign(user, jwtSecret, { expiresIn: "365d" });
    res.send({ token });
  })
);

app.post(
  "/all-users",
  asyncRoute(async (req, res) => {
    const { users } = await getCollections();
    const userData = {
      ...req.body,
      Email: req.body?.Email?.toLowerCase(),
    };

    const result = await users.insertOne(userData);
    res.send(result);
  })
);

app.get(
  "/all-users",
  verifyAdmin,
  asyncRoute(async (req, res) => {
    const { users } = await getCollections();
    const result = await users.find().toArray();
    res.send(result);
  })
);

app.patch(
  "/update-user-role",
  verifyAdmin,
  asyncRoute(async (req, res) => {
    const { users } = await getCollections();
    const email = req.query.email?.toLowerCase();
    const newRole = req.body.role;

    const result = await users.findOneAndUpdate(
      { Email: email },
      { $set: { Role: newRole } },
      { returnDocument: "after" }
    );

    res.send({ success: true, result });
  })
);

app.patch(
  "/update-user-status",
  verifyAdmin,
  asyncRoute(async (req, res) => {
    const { users } = await getCollections();
    const email = req.query.email?.toLowerCase();
    const newStatus = req.body.status;

    const result = await users.findOneAndUpdate(
      { Email: email },
      { $set: { status: newStatus } },
      { returnDocument: "after" }
    );

    res.send({ success: true, result });
  })
);

app.get(
  "/get-user/:email",
  asyncRoute(async (req, res) => {
    const { users } = await getCollections();
    const email = req.params.email.toLowerCase();
    const result = await users.findOne({ Email: email });
    res.send(result);
  })
);

app.put(
  "/update-user-profile/:email",
  verifyToken,
  asyncRoute(async (req, res) => {
    const { users } = await getCollections();
    const email = req.params.email.toLowerCase();

    const result = await users.updateOne(
      { Email: email },
      { $set: { ...req.body, Email: email } },
      { upsert: true }
    );

    res.send(result);
  })
);

app.post(
  "/new-donation-request",
  verifyToken,
  asyncRoute(async (req, res) => {
    const { donations } = await getCollections();
    const result = await donations.insertOne(req.body);
    res.send(result);
  })
);

app.get(
  "/my-donation-request/:email",
  verifyToken,
  asyncRoute(async (req, res) => {
    const { donations } = await getCollections();
    const email = req.params.email;
    const result = await donations.find({ requesterEmail: email }).toArray();
    res.send(result);
  })
);

app.get(
  "/my-recent-donation/:email",
  verifyToken,
  asyncRoute(async (req, res) => {
    const { donations } = await getCollections();
    const email = req.params.email;
    const result = await donations
      .find({ requesterEmail: email })
      .sort({ donationDates: -1, donationTimes: 1 })
      .limit(3)
      .toArray();
    res.send(result);
  })
);

app.get(
  "/all-blood-donation-request",
  verifyAdminVolunteer,
  asyncRoute(async (req, res) => {
    const { donations } = await getCollections();
    const result = await donations.find().toArray();
    res.send(result);
  })
);

app.put(
  "/update-donation-request/:id",
  verifyToken,
  asyncRoute(async (req, res) => {
    const { donations } = await getCollections();
    const result = await donations.findOneAndUpdate(
      { _id: toObjectId(req.params.id) },
      { $set: { ...req.body } },
      { returnDocument: "after" }
    );

    res.send({ success: true, result });
  })
);

app.get(
  "/get-request-data/:id",
  verifyToken,
  asyncRoute(async (req, res) => {
    const { donations } = await getCollections();
    const result = await donations.findOne({ _id: toObjectId(req.params.id) });
    res.send(result);
  })
);

app.patch(
  "/update-donation-status/:id",
  verifyAdminVolunteer,
  asyncRoute(async (req, res) => {
    const { donations } = await getCollections();
    const result = await donations.findOneAndUpdate(
      { _id: toObjectId(req.params.id) },
      { $set: { donationStatus: req.query.status } },
      { returnDocument: "after" }
    );

    res.send(result);
  })
);

app.patch(
  "/user-donation-status-update/:id",
  verifyToken,
  asyncRoute(async (req, res) => {
    const { donations } = await getCollections();
    const result = await donations.findOneAndUpdate(
      { _id: toObjectId(req.params.id) },
      { $set: { donationStatus: req.query.status } },
      { returnDocument: "after" }
    );

    res.send(result);
  })
);

app.get(
  "/search-donors",
  asyncRoute(async (req, res) => {
    const { donations } = await getCollections();
    const { bloodGroup, district, upazila } = req.query;
    const query = {};

    if (bloodGroup) query.bloodGroup = bloodGroup;
    if (district) query.district = district;
    if (upazila) query.upazila = upazila;

    const result = await donations.find(query).toArray();
    res.send(result);
  })
);

app.get(
  "/pending-donation-data",
  asyncRoute(async (req, res) => {
    const { donations } = await getCollections();
    const {
      bloodGroup,
      district,
      upazila,
      search,
      sort = "date-asc",
      page = "1",
      limit = "8",
    } = req.query;
    const query = { donationStatus: "pending" };

    if (bloodGroup) query.bloodGroup = bloodGroup;
    if (district) query.district = district;
    if (upazila) query.upazila = upazila;
    if (search) {
      const regex = new RegExp(escapeRegex(search), "i");
      query.$or = [
        { recipientName: regex },
        { hospital: regex },
        { district: regex },
        { upazila: regex },
        { bloodGroup: regex },
      ];
    }

    const sortMap = {
      "date-asc": { donationDates: 1, donationTimes: 1 },
      "date-desc": { donationDates: -1, donationTimes: -1 },
      "group-asc": { bloodGroup: 1, donationDates: 1 },
      "location-asc": { district: 1, upazila: 1 },
    };
    const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(limit, 10) || 8, 1), 40);
    const total = await donations.countDocuments(query);
    const items = await donations
      .find(query)
      .sort(sortMap[sort] || sortMap["date-asc"])
      .skip((pageNumber - 1) * pageSize)
      .limit(pageSize)
      .toArray();

    res.send({
      items,
      total,
      page: pageNumber,
      limit: pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  })
);

app.get(
  "/view-details/:id",
  asyncRoute(async (req, res) => {
    const { donations } = await getCollections();
    const result = await donations.findOne({ _id: toObjectId(req.params.id) });
    res.send(result);
  })
);

app.get(
  "/dashboard-stats",
  verifyAdminVolunteer,
  asyncRoute(async (req, res) => {
    const { donations, users } = await getCollections();
    const [totalUsers, totalRequests, usersByRole, requestsByStatus, requestsByBloodGroup] =
      await Promise.all([
        users.countDocuments(),
        donations.countDocuments(),
        users.aggregate([{ $group: { _id: "$Role", count: { $sum: 1 } } }]).toArray(),
        donations.aggregate([{ $group: { _id: "$donationStatus", count: { $sum: 1 } } }]).toArray(),
        donations.aggregate([{ $group: { _id: "$bloodGroup", count: { $sum: 1 } } }]).toArray(),
      ]);

    res.send({
      totalUsers,
      totalRequests,
      totalFunding: 0,
      usersByRole,
      requestsByStatus,
      requestsByBloodGroup,
    });
  })
);

app.post(
  "/contact-messages",
  asyncRoute(async (req, res) => {
    const { contacts } = await getCollections();
    const message = {
      name: requireString(req.body, "name"),
      email: requireEmail(req.body),
      subject: requireString(req.body, "subject"),
      message: requireString(req.body, "message"),
      status: "new",
      createdAt: new Date(),
    };

    const result = await contacts.insertOne(message);
    res.status(201).send({ success: true, insertedId: result.insertedId });
  })
);

app.patch(
  "/confirm-donation/:id",
  asyncRoute(async (req, res) => {
    const { donations } = await getCollections();
    const { donorName, donorEmail, donationStatus } = req.body;

    const result = await donations.findOneAndUpdate(
      { _id: toObjectId(req.params.id) },
      { $set: { donorName, donorEmail, donationStatus } },
      { upsert: true, returnDocument: "after" }
    );

    res.send(result);
  })
);

app.delete(
  "/delete-donation-request/:id",
  verifyToken,
  asyncRoute(async (req, res) => {
    const { donations } = await getCollections();
    const result = await donations.deleteOne({ _id: toObjectId(req.params.id) });
    res.send(result);
  })
);

app.post(
  "/create-new-blog",
  verifyAdminVolunteer,
  asyncRoute(async (req, res) => {
    const { blogs } = await getCollections();
    const result = await blogs.insertOne(req.body);
    res.send(result);
  })
);

app.get(
  "/all-blogs",
  verifyAdminVolunteer,
  asyncRoute(async (req, res) => {
    const { blogs } = await getCollections();
    const query = req.query.status ? { status: req.query.status } : {};
    const result = await blogs.find(query).toArray();
    res.send(result);
  })
);

app.patch(
  "/update-blog-status/:id",
  verifyAdmin,
  asyncRoute(async (req, res) => {
    const { blogs } = await getCollections();
    const result = await blogs.findOneAndUpdate(
      { _id: toObjectId(req.params.id) },
      { $set: { status: req.query.status } },
      { returnDocument: "after" }
    );

    res.send(result);
  })
);

app.delete(
  "/delete-blog/:id",
  verifyAdmin,
  asyncRoute(async (req, res) => {
    const { blogs } = await getCollections();
    const result = await blogs.deleteOne({ _id: toObjectId(req.params.id) });
    res.send(result);
  })
);

app.get(
  "/blogs",
  asyncRoute(async (req, res) => {
    const { blogs } = await getCollections();
    const result = await blogs.find({ status: "published" }).toArray();
    res.send(result);
  })
);

app.get(
  "/blog-details/:id",
  asyncRoute(async (req, res) => {
    const { blogs } = await getCollections();
    const result = await blogs.findOne({ _id: toObjectId(req.params.id) });
    res.send(result);
  })
);

app.use((req, res) => {
  res.status(404).send({ message: "Route not found" });
});

app.use((err, req, res, next) => {
  const statusCode = err.statusCode || err.status || 500;
  console.error(err);

  res.status(statusCode).send({
    message: statusCode === 500 ? "Server error" : err.message,
    error: err.message,
  });
});

if (require.main === module) {
  app.listen(port, () => {
    console.log(`server running on port: ${port}`);
  });
}

module.exports = app;
