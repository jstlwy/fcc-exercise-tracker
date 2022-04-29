require('dotenv').config();
const fastify = require('fastify')({logger: true});
const fastifyStatic = require('@fastify/static');
const path = require('path');
//const app = express();

// Enable cross-origin resource sharing
// so freeCodeCamp can remotely test the app
//const cors = require('cors');
//app.use(cors());

// bodyparser needed to handle form input
/*
const bodyParser = require('body-parser');
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
*/

// Connect to MongoDB
const { ExerciseDAO } = require('./dao.js');
let edao = new ExerciseDAO();

// Utility function for validating input
function isInvalidString(str) {
  return (!str || str.trim().length === 0);
}

// Declare location of static assets
fastify.register(fastifyStatic, {
  root: path.join(__dirname, 'public')
});

// Get main page
fastify.get('/', (request, reply) => {
  return reply.sendFile(__dirname + '/views/index.html')
});


// Create new user.
// Responds with JSON containing username and _id.
fastify.post('/api/users', (request, reply) => {
  if (isInvalidString(request.body.username)) {
    reply.send({"error": "username missing"});
  }
  
  edao.createUser(request.body.username)
    .then((result) => {
      console.log(`\nUser created:`);
      console.log(result);
      reply.send(result);
    });
});


// Get an array containing all user information.
fastify.get('/api/users', (request, reply) => {;
  edao.getAllUserInfo()
    .then((result) => {
      console.log('\nAll user info requested.');
      reply.send(result);
    });
});


// Add an exercise to a user's log.
//
// Responds with JSON containing:
// username
// _id
// description: of exercise; String
// duration:    in minutes; must be Number
// date:        if not specified, current.
//              must be in datestring format from Date API
fastify.post('/api/users/:_id/exercises', (request, reply) => {
  // Validate input
  if (isInvalidString(request.params._id)) {
    reply.send({"error": "userid missing"});
    return;
  }
  if (isInvalidString(request.body.description)) {
    reply.send({"error": "description missing"});
    return;
  }
  if (isInvalidString(request.body.duration)) {
    reply.json({"error": "duration missing"});
    return;
  }
  if (isInvalidString(request.body.date)) {
    reply.json({"error": "date missing"});
    return;
  }
  
  edao.addExerciseToUser(
    request.params._id,
    request.body.description,
    request.body.duration,
    request.body.date
  ).then((result) => {
    console.log('\nExercise added:');
    console.log(result);
    reply.send(result);
  });
});


// Get a user's information and complete exercise log.
// Contains additional "count" field of all exercises.
//
// User can add from, to, and limit parameters.
// format: GET /api/users/:_id/logs?[from][&to][&limit]
// from:   start date
// to:     end date
// limit:  max number of exercises to get

// First, save these aggregate pipeline stages
// outside of the app.get() function
// since they will be used repeatedly.
fastify.get('/api/users/:_id/logs', (request, reply) => {
  // Validate input
  if (isInvalidString(request.params._id)) {
    reply.send({"error": "userid missing"});
    return;
  }
  
  // The following 3 parameters are optional:
  let from = isInvalidString(request.query.from) ? null : request.query.from;
  let to = isInvalidString(request.query.to) ? null : request.query.to;
  let limit = isInvalidString(request.query.limit) ? null : request.query.limit;
  
  edao.getExerciseLog(request.params._id, from, to, limit)
    .then((result) => {
      console.log('\nExercise log requested:');
      console.log(request.query);
      console.log(result);
      reply.send(result);
    });
});


// Start the app
const port = ('PORT' in process.env) ? process.env.PORT : 3000;
fastify.listen(port, (err, address) => {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }
  console.log(`The app is listening on port ${address}.`)
});


// Also need to define response to 'SIGTERM'?
process.on('SIGINT', () => {
  // Close MongoDB connection
  edao.disconnect();
  // Shut down server
  fastify.close().then(() => {
    console.log('Server process terminated.');
  }, (err) => {
    console.error(err);
  });
});
