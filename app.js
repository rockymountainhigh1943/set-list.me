var express = require('express')
  , routes = require('./routes')
  , http = require('http')
  , path = require('path')
  , cradle = require('cradle')
  , passport = require('passport')
  , flash = require('connect-flash')
  , socketio = require('socket.io')
  , LocalStrategy = require('passport-local').Strategy;

var conn = new cradle.Connection();
var db = conn.database('set_list_me');

var app = express();

app.configure(function(){
  app.set('port', process.env.PORT || 3000);
  app.set('views', __dirname + '/views');
  app.set('view engine', 'ejs');
  app.use(express.favicon());
  app.use(express.logger('dev'));
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(express.cookieParser('your secret here'));
  app.use(flash());
  app.use(express.session({ secret: 'John Denver' }));
  app.use(passport.initialize());
  app.use(passport.session());
  app.use(app.router);
  app.use(require('less-middleware')({ src: __dirname + '/public' }));
  app.use(express.static(path.join(__dirname, 'public')));
});


// Passport Stuff
passport.use(new LocalStrategy(
  function(username, password, done) {
    db.view('user/allUsers', {key: username} , function(err, user){
      if(err){
        return done(err);
      }
      if(user.length &&  user[0].value.user == username &&  user[0].value.pass == password){
        return done(null, user[0].value);
      } else {
        return done(null, false, { message: 'Invalid Username or Password' });
      }
    });
  }
));

function findByUsername(username, fn) {
    db.view('user/allUsers', {key: username}, function(err, res) {
        if(err || !res.length) return fn(null, null);
        //console.log(err, res);
        fn(null, res[0].value);
    });
}

function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) { return next(); }
  res.redirect('/')
};

passport.serializeUser(function(user, done) {
  //console.log(user.user);
  done(null, user.user);
});

passport.deserializeUser(function(username, done) {
  findByUsername(username, function (err, user) {
    done(err, user);
  });
});

// We start our Express server
var server = http.createServer(app);
server.listen(app.get('port'), function(){
  console.log("Express server listening on port " + app.get('port'));
});





// Get the login screen 
app.get('/', function(req, res){
  res.render('index');
});

// Attempt to login
app.post('/login',
  passport.authenticate('local', {
    successRedirect: '/dashboard',
    failureRedirect: '/?error=true',
    failureFlash: true
  })
);

// Logout
app.get('/logout', function(req, res){
  req.logOut();
  res.redirect('/');
});

// The user Dashboard
app.get('/dashboard', ensureAuthenticated, function (req, res){
  db.get('band-'+req.user.band_id, function (err, band){
    var bandInfo = band;
    db.view('songs/byBand', {key: req.user.band_id}, function (err, songs){
      var items = songs;
      res.render('dashboard', {user: req.user, band: bandInfo,  list: items});
    });
  });
});





// Socket.IO Stuff
var io = socketio.listen(server);

// On Connection
io.sockets.on('connection', function(socket){
  socket.broadcast.emit('news', { notification: 'User Logged On', id: socket.id });

  socket.on('newSong', function(data){

    db.save({
      title: data.message,
      band: data.band,
      type: 'song',
      user: data.user
    }, function (err, res){
      if(res){
        io.sockets.emit('success', {info: data, response: res});
      } else {
        io.sockets.emit('failure', {message: 'Failed to add song'});
      }
    });
    
  });

  socket.on('delete', function (data){
    db.remove(data.id, data.rev, function (err, res){
      if(res){
        io.sockets.emit('deleteSuccess', data);
      } else {
        io.sockets.emit('failure', data);
      }
    });
  });

  socket.on('disconnect', function () {
    io.sockets.emit('news', { notification: 'User Logged Off'});
  });

});