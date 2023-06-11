const express = require('express')
const app = express()
const cors = require('cors');
const port = process.env.PORT || 3000
const jwt = require("jsonwebtoken")
require("dotenv").config();

const stripe = require("stripe")(process.env.SECRET_KEY_STRIPE);


//middleware
app.use(express.json())
app.use(cors())

const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status(401).send({ error: true, message: 'Unauthorized access' })
  }

  //bearer token split

  const token = authorization.split(' ')[1];
  jwt.verify(token, process.env.TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ error: true, message: 'invalid token found, unauthorized access!' })
    }
    req.decoded = decoded;

  })
  next()
}



const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

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
    const usersCollection = database.collection('users')
    const selectedClsCollection = database.collection('selectedClass')
    const paymentsCollection = database.collection('payments')


    //jwt token generator
    app.post('/jwt', (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.TOKEN_SECRET, { expiresIn: '1h' })
      res.send({ token })
    })

    //user admin verify middleware

    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      if (user?.role !== 'admin') {
        return res.status(403).send({ error: true, message: 'forbidden admin access' })
      }
      next()
    }

    // user instructor verify middleware
    const verifyInstructor = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      if (user?.role !== 'instructor') {
        return res.status(403).send({ error: true, message: 'forbidden instructor access' })
      }
      next()
    }


    // student routes

    app.get('/selected-classes', async (req, res) => {
      const email = req.query.email
      let query = {};
      if (req.query?.email) {
        query = { studentEmail: email }
      }
      const result = await selectedClsCollection.find(query).toArray()
      res.send(result)
    })
    // payment related routes
    app.get('/payments', async (req, res) => {
      const email = req.query.email
      let query = {};
      if (req.query?.email) {
        query = { email: email }
      }
      const result = await paymentsCollection.find(query).sort({date: -1}).toArray()
      res.send(result)
    })
    app.post('/create-payment-intent', verifyJWT, async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);
      console.log(amount)
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: 'usd',
        payment_method_types: ['card']
      })
      res.send({
        clientSecret: paymentIntent.client_secret
      })
    })

    app.post('/payments', async (req, res) => {
      const payment = req.body;
      const paymentHistory = await paymentsCollection.insertOne(payment)
      const query = { _id: new ObjectId(payment.checkoutId) };
      const deleteResult = await selectedClsCollection.deleteOne(query);
      const { availableSeats, classId } = payment;
      const filter = { _id: new ObjectId(classId) }
      
      const updatedDoc = {
        $set: {
          availableSeats: availableSeats - 1 
        }
      }
      const updateResult = await classesCollection.updateOne(filter, updatedDoc)

      res.send({ paymentHistory, deleteResult, updateResult })
    })
    app.post('/selected-class', async (req, res) => {
      const cls = req.body;
      const { classId, studentEmail } = cls;
      const query = { studentEmail, classId }
      const exitingCls = await selectedClsCollection.findOne(query);
      if (exitingCls) {
        console.log('exiting paise')

        return res.send({ message: 'Class already exists' })
      }
      const result = await selectedClsCollection.insertOne(cls);
      res.send(result)
    })
    //users routes

    app.get('/users', verifyJWT, async (req, res) => {
      console.log('hitting here')
      const result = await usersCollection.find().toArray()
      console.log(result)
      res.send(result)
    })

    app.post('/users', async (req, res) => {
      const user = req.body;
      const query = { email: user.email }
      const exitingUser = await usersCollection.findOne(query);
      if (exitingUser) {
        return res.send({ message: 'User already exists' })
      }
      const result = await usersCollection.insertOne(user);
      res.send(result)
    })

    //admin routes
    app.get('/users/admin/:email', verifyJWT, async (req, res) => {
      const email = req.params.email;
      const jwtEmail = req.decoded.email;
      if (jwtEmail !== email) {
        res.send({ admin: false })
      }
      else {
        const query = { email: email };
        const user = await usersCollection.findOne(query);
        if (user?.role !== 'admin') {
          return res.send({ admin: false })
        }
        res.send({ admin: true })
      }
    })
    app.patch('/users/admin/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          role: 'admin'
        }
      }
      const result = await usersCollection.updateOne(filter, updatedDoc)
      res.send(result)
    })




    //classes
    app.get('/classes', async (req, res) => {
      const result = await classesCollection.find().toArray();
      res.send(result)
    })

    app.post('/classes', async (req, res) => {
      const cls = req.body;
      console.log(cls)
      const { price, availableSeats } = cls;
      const amount = parseInt(price)
      const seats = parseInt(availableSeats)
      cls.price = amount
      cls.availableSeats = seats;
      const result = await classesCollection.insertOne(cls);
      res.send(result);
    })


    app.patch('/selected-class/response', async (req, res) => {
      const {id, decision} = req.body;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          status: decision ? 'approved' : 'denied'
        }
      }
      const result = await classesCollection.updateOne(filter, updatedDoc)
      res.send(result)
    })

    //instructors routes

    app.get('/users/instructor/:email', verifyJWT, async (req, res) => {
      const email = req.params.email;
      const jwtEmail = req.decoded.email;
      if (jwtEmail !== email) {
        res.send({ instructor: false })
      }
      else {
        const query = { email: email };
        const user = await usersCollection.findOne(query);
        if (user?.role !== 'instructor') {
          return res.send({ instructor: false })
        }
        res.send({ instructor: true })
      }
    })
    app.get('/instructors', async (req, res) => {
      const result = await instructorsCollection.find().toArray();
      res.send(result)
    })

    app.patch('/users/instructor/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          role: 'instructor'
        }
      }
      const result = await usersCollection.updateOne(filter, updatedDoc);
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

