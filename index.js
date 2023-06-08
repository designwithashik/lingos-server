const express = require('express')
const app = express()
const cors = require('cors');
const port = process.env.PORT || 3000
const jwt = require("jsonwebtoken")

require("dotenv").config();

//middleware
app.use(express.json())
app.use(cors())

const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status(401).send({error: true, message: 'Unauthorized access'})
  }

  //bearer token split

  const token = authorization.split(' ')[1];
  jwt.verify(token, process.env.TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({error:true, message: 'invalid token found, unauthorized access!'})
    }
    req.decoded = decoded;
    
  })
  next()
}



const { MongoClient, ServerApiVersion } = require('mongodb');

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.u1007ka.mongodb.net/?retryWrites=true&w=majority`;



const client = new MongoClient(uri, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    }
  });
  async function run() {
    try {
      // Connect the client to the server	(optional starting in v4.7)
      await client.connect();

      const database = client.db('lingos')
      const classesCollection = database.collection('classes')
      const instructorsCollection = database.collection('instructors')


      //classes
      app.get('/classes', async (req, res) => {
        const result = await classesCollection.find().toArray();
        res.send(result)
      })
      // Send a ping to confirm a successful connection
      await client.db("admin").command({ ping: 1 });
      console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
      // Ensures that the client will close when you finish/error
      // await client.close();
    }
  }
  run().catch(console.dir);
  
  

app.get('/', (req, res) => {
    res.send('Learn a new language')
})

app.listen(port, () => {
    console.log(`Listening on port ${port}`)
})

