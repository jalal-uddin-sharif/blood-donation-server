const express = require("express");
const cors = require("cors");
const app = express();
const port = process.env.PORT || 3001;
require("dotenv").config();
const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const Username = process.env.DATABASE_ACCESS_USERNAME;
const Password = process.env.DATABASE_ACCESS_PASSWORD;

app.use(express.json());
app.use(
  cors({
    origin: ["https://red-love-donation.web.app", "http://localhost:5173"],
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  })
);

//middleware
const verifyToken = (req, res, next) => {
  console.log(req.headers);
  if (!req.headers.authorization)
    return res.status(401).send({ message: "unauthorized access" });
  const token = req.headers.authorization.split(" ")[1];
  jwt.verify(token, process.env.API_SECRET_KEY, (err, decoded) => {
    if (err) return res.status(401).send({ message: "unauthorized access" });
    req.decoded = decoded;
    next();
  });
};


const uri = `mongodb+srv://${Username}:${Password}@cluster0.zukg64l.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});
async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();
    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    // console.log("Pinged your deployment. You successfully connected to MongoDB!");

    const redLoveUserCollection = client.db("RedLove").collection("User");
    const redLoveBlogCollection = client
      .db("RedLove")
      .collection("BlogsCollection");
    const redLoveRegisteredDonation = client
      .db("RedLove")
      .collection("createdDonation");

  //verify admin
const verifyAdmin = (req, res, next) => {
  if (!req.headers.authorization)
    return res.status(401).send({ message: "Unauthorized access" });
  const token = req.headers.authorization.split(" ")[1];

  jwt.verify(token, process.env.API_SECRET_KEY, async(err, decoded) => {
    if (err) return res.status(401).send({ message: "Unauthorized access" });
    const user = await redLoveUserCollection.findOne({Email: decoded.email})
    if(user?.Role === "Admin"){
      next()
    } else{
      return res.status(403).send({ message: "forbidden access" })
     }
  });
};

  //verify admin and volunteer
const verifyAdminVolunteer = (req, res, next) => {
  if (!req.headers.authorization)
    return res.status(401).send({ message: "Unauthorized access" });
  const token = req.headers.authorization.split(" ")[1];

  jwt.verify(token, process.env.API_SECRET_KEY, async(err, decoded) => {
    if (err) return res.status(401).send({ message: "Unauthorized access" });
    const user = await redLoveUserCollection.findOne({Email: decoded.email})
    if(user?.Role === "Admin" || user?.Role === "Volunteer"){
      next()
    } else{
     return res.status(403).send({ message: "forbidden access" })
    }
  });
};

    //jwt token
    app.post("/jwt", async (req, res) => {
      const user = req.body;

      const token = jwt.sign(user, process.env.API_SECRET_KEY, {
        expiresIn: "365d",
      });
      res.send({ token });
    });

    //add user from registration page
    app.post("/all-users", async (req, res) => {
      const UserData = req.body;
      const result = await redLoveUserCollection.insertOne(UserData);
      res.send(result);
    });

    //create donation request
    app.post("/new-donation-request", verifyToken, async (req, res) => {
      const registeredDonation = req.body;
      const result = await redLoveRegisteredDonation.insertOne(
        registeredDonation
      );
      res.send(result);
    });

    //get donation requests
    app.get("/my-donation-request/:email", verifyToken, async (req, res) => {
      const email = req.params.email;

      const result = await redLoveRegisteredDonation
        .find({ requesterEmail: email })
        .toArray();
      res.send(result);
    });

    //get recent requests
    app.get("/my-recent-donation/:email", verifyToken, async (req, res) => {
      console.log(req.headers);
      const email = req.params.email;
      const result = await redLoveRegisteredDonation
        .find({ requesterEmail: email })
        .sort({ donationDates: -1, donationTimes: 1 })
        .limit(3)
        .toArray();
      res.send(result);
    });

    //get all users for admin only
    app.get("/all-users", verifyAdmin, async (req, res) => {
      const result = await redLoveUserCollection.find().toArray();
      res.send(result);
    });

    //change user role
    app.patch("/update-user-role", async (req, res) => {
      const email = req.query.email;
      const newRole = req.body.role;

      const result = await redLoveUserCollection.findOneAndUpdate(
        { Email: email },
        { $set: { Role: newRole } },
        { returnDocument: "after" }
      );
      res.send({ success: true, result });
    });

    //update user status
    app.patch("/update-user-status", async (req, res) => {
      const email = req.query.email;
      const newStatus = req.body.status;

      const result = await redLoveUserCollection.findOneAndUpdate(
        { Email: email },
        { $set: { status: newStatus } },
        { returnDocument: "after" }
      );
      res.send({ success: true, result });
    });

    //get user by email
    app.get("/get-user/:email", async (req, res) => {
      const email = req.params.email.toLocaleLowerCase();
      const result = await redLoveUserCollection.findOne({ Email: email });
      res.send(result);
    });

    //update user profile
    app.put("/update-user-profile/:email", verifyToken, async (req, res) => {
      const userData = req.body;
      const email = { Email: req.params.email };
      const options = { upsert: true };
      const updateBlog = {
        $set: {
          ...userData,
        },
      };
      const result = await redLoveUserCollection.updateOne(
        email,
        updateBlog,
        options
      );
      res.send(result);
    });

    //get all blood donation request
    app.get("/all-blood-donation-request", verifyAdminVolunteer, async (req, res) => {
      const result = await redLoveRegisteredDonation.find().toArray();
      res.send(result);
    });

    //update donation request
    app.put("/update-donation-request/:id", verifyToken, async (req, res) => {
      const newReq = req.body;

      const result = await redLoveRegisteredDonation.findOneAndUpdate(
        { _id: new ObjectId(req.params.id) },
        { $set: { ...newReq } },
        { returnDocument: "after" }
      );
      res.send({ success: true, result });
    });

    //get request data by id
    app.get("/get-request-data/:id", verifyToken, async (req, res) => {
      const result = await redLoveRegisteredDonation.findOne({
        _id: new ObjectId(req.params.id),
      });
      res.send(result);
    });

    //create blog
    app.post("/create-new-blog", verifyAdminVolunteer, async (req, res) => {
      const blogData = req.body;
      const result = await redLoveBlogCollection.insertOne(blogData);
      res.send(result);
    });

    //get all blogs
    app.get("/all-blogs", async (req, res) => {
      const status = req.query.status;
      const query = {};
      if (status) {
        query.status = status;
      }
      const result = await redLoveBlogCollection.find(query).toArray();
      res.send(result);
    });

    //update blog status
    app.patch("/update-blog-status/:id", verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const status = req.query.status;
      const result = await redLoveBlogCollection.findOneAndUpdate(
        { _id: new ObjectId(id) },
        { $set: { status: status } },
        { returnDocument: "after" }
      );
      res.send(result);
    });

    //delete blog
    app.delete("/delete-blog/:id", verifyAdmin, async (req, res) => {
      const result = await redLoveBlogCollection.deleteOne({
        _id: new ObjectId(req.params.id),
      });
      res.send(result);
    });

    //update donation status
    app.patch("/update-donation-status/:id", verifyAdminVolunteer, async (req, res) => {
      const id = req.params.id;
      const donationStatus = req.query.status;
      const result = await redLoveRegisteredDonation.findOneAndUpdate(
        { _id: new ObjectId(id) },
        { $set: { donationStatus: donationStatus } },
        { returnDocument: "after" }
      );
      res.send(result);
    });

    //update donation status by user
    app.patch("/user-donation-status-update/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const donationStatus = req.query.status;
      const result = await redLoveRegisteredDonation.findOneAndUpdate(
        { _id: new ObjectId(id) },
        { $set: { donationStatus: donationStatus } },
        { returnDocument: "after" }
      );
      res.send(result);
    });

    //search donors
    app.get("/search-donors", async (req, res) => {
      const { bloodGroup, district, upazila } = req.query;
      const query = {
        bloodGroup,
        district,
        upazila,
      };
      const result = await redLoveRegisteredDonation.find(query).toArray();
      res.send(result);
    });

    //get pending donation data
    app.get("/pending-donation-data", async (req, res) => {
      const result = await redLoveRegisteredDonation
        .find({
          donationStatus: "pending",
        })
        .toArray();
      res.send(result);
    });

    //view donation details
    app.get("/view-details/:id", verifyToken, async (req, res) => {
      const result = await redLoveRegisteredDonation.findOne({
        _id: new ObjectId(req.params.id),
      });
      res.send(result);
    });

    //get all published blogs
    app.get("/blogs", async (req, res) => {
      const query = { status: "published" };
      const result = await redLoveBlogCollection.find(query).toArray();
      res.send(result);
    });

    //get details of blog
    app.get("/blog-details/:id", async (req, res) => {
      const result = await redLoveBlogCollection.findOne({
        _id: new ObjectId(req.params.id),
      });
      res.send(result);
    });

    //update donor information
    app.patch("/confirm-donation/:id", async (req, res) => {
      const { donorName, donorEmail, donationStatus } = req.body;
      const id = req.params.id;
      const result = await redLoveRegisteredDonation.findOneAndUpdate(
        { _id: new ObjectId(id) },
        { $set: { donorName, donorEmail, donationStatus } },
        { upsert: true, returnOriginal: false }
      );
      res.send(result);
    });

    //delete donation request
    app.delete("/delete-donation-request/:id", async (req, res) => {
      const result = await redLoveRegisteredDonation.deleteOne({
        _id: new ObjectId(req.params.id),
      });
      res.send(result);
    });
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}

run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Server responsed");
});

app.listen(port, () => {
  console.log(`surver running on port: ${port}`);
});
