const express = require("express");
const cors = require("cors");
const app = express();
const port = process.env.PORT || 3001;
require("dotenv").config();
const { MongoClient, ServerApiVersion } = require("mongodb");

const Username = process.env.DATABASE_ACCESS_USERNAME;
const Password = process.env.DATABASE_ACCESS_PASSWORD;

app.use(express.json());
app.use(
  cors({
    origin: ["http://localhost:5173"],
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  })
);

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
    const redLoveRegisteredDonation = client
      .db("RedLove")
      .collection("createdDonation");

    //add user from registration page
    app.post("/all-users", async (req, res) => {
      const UserData = req.body;
      console.log(UserData);
      const result = await redLoveUserCollection.insertOne(UserData);
      res.send(result);
    });

    //create donation request
    app.post("/new-donation-request", async (req, res) => {
      const registeredDonation = req.body;
      const result = await redLoveRegisteredDonation.insertOne(
        registeredDonation
      );
      res.send(result);
    });

    //get donation requests
    app.get("/my-donation-request/:email", async (req, res) => {
      const email = req.params.email;
      console.log(email);
      const result = await redLoveRegisteredDonation
        .find({ requesterEmail: email })
        .toArray();
      res.send(result);
    });

    //get recent requests
    app.get("/my-recent-donation/:email", async (req, res) => {
      const email = req.params.email;
      const result = await redLoveRegisteredDonation
        .find({ requesterEmail: email })
        .sort({ donationDates: -1, donationTimes: 1 })
        .limit(3)
        .toArray();
      res.send(result);
    });

    //get all users for admin only
    app.get("/all-users", async (req, res) => {
      const result = await redLoveUserCollection.find().toArray();
      res.send(result);
    });

    //change user role
    app.patch("/update-user-role", async (req, res) => {
      const email = req.query.email;
      const newRole = req.body.role;
      console.log(email, newRole);

      const result = await redLoveUserCollection.findOneAndUpdate(
        { Email: email },
        { $set: {  Role: newRole }},
        {returnDocument: "after"}
      );
      res.send({success: true, result})
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
