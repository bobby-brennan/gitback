var _ = require('underscore');
var Path = require('path');
var FS = require('fs');
var Request = require('request');
var Expect = require('chai').expect;
var Rmdir = require('rimraf');
var Mkdir = require('mkdirp');

var Gitback = require('../index.js');

var TEST_REPO_DIR = __dirname + '/petstore';

var Git = require('simple-git')(TEST_REPO_DIR);
var TEST_BRANCH = 'testbranch';
var REST_BRANCH = 'master';
var PET_DIR = Path.join(TEST_REPO_DIR, 'pets');
var OWNER_DIR = Path.join(TEST_REPO_DIR, 'owners');

describe('Server', function() {
  this.timeout(3500);
  var gitback = null;
  before(function(done) {
    Git.checkout(TEST_BRANCH, function(err) {
      if (err) throw err;
      if (FS.existsSync(PET_DIR)) Rmdir.sync(PET_DIR);
      if (FS.existsSync(OWNER_DIR)) Rmdir.sync(OWNER_DIR);
      Git.commit('remove items', ['.']).checkout(REST_BRANCH, function(err) {
        if (err) throw err;
        gitback = new Gitback({remote: TEST_REPO_DIR, branch: TEST_BRANCH, directory: __dirname + '/test_database'});
        gitback.initialize(function() {
          gitback.listen(3333);
          done();
        });
      })
    });
  });

  after(function() {
    Rmdir.sync(__dirname + '/test_database');
  })

  var HOST = 'http://localhost:3333';
  var LUCY = {
    "name": "Lucy",
    "owners": ["bbrennan"],
    "age": 2,
    "type": "dog",
  }
  var TACO = {
    "name": "Taco",
    "owners": ["annie"],
    "age": 1,
    "type": "cat",
  }
  var BOBBY = {
    id: "bbrennan",
    name: "Bobby",
    password: 'bbpass',
  }
  var ANDREW = {
    id: 'abj',
    name: 'Andrew',
    password: 'aapass',
  }
  var ANNIE = {
    id: "annie",
    name: "Annie",
    password: 'annepass',
  }
  var TACO_FULL = JSON.parse(JSON.stringify(TACO));
  var ANNIE_FULL = JSON.parse(JSON.stringify(ANNIE));
  delete ANNIE_FULL.password;
  ANNIE_FULL.pets = [TACO];
  TACO_FULL.owners = [{id: ANNIE.id, name: ANNIE.name}];

  var expectResponse = function(path, expected, done) {
    Request(HOST + path, {json: true}, function(err, resp, body) {
      Expect(err).to.equal(null);
      Expect(body).to.deep.equal(expected);
      done();
    });
  }

  var expectBody = function(fn) {
    return function(method, path, data, user, done) {
      if (!done) {
        done = user;
        user = null;
      }
      var headers = {};
      if (user) headers.Authorization = 'Basic ' + user.id + ':' + user.password;
      Request(HOST + path, {method: method, json: true, body: data, headers: headers}, function(err, resp, body) {
        Expect(err).to.equal(null);
        fn(body);
        done();
      })
    }
  }

  var expectSuccess = expectBody(function(body) {
    Expect(body).to.deep.equal({success: true});
  });

  var expectFailure = expectBody(function(body) {
    Expect(body.error).to.be.a('string');
  })

  it('should not allow posting a bad schema', function(done) {
    expectFailure('post', '/pets', _.extend({}, TACO, {age: '7'}), done);
  });

  it('should not allow posting extra fields', function(done) {
    expectFailure('post', '/pets', _.extend({foo: 'bar'}, TACO), done);
  })

  it('should not have any pets', function(done) {
    expectResponse('/pets', [], done);
  })

  it('should allow posting a pet', function(done) {
    expectSuccess('post', '/pets', TACO, done);
  });

  it('should not allow posting an owner without password', function(done) {
    expectFailure('post', '/owners', {id: ANNIE.id, name: ANNIE.name}, done);
  })

  it('should allow posting an owner', function(done) {
    expectSuccess('post', '/owners', ANNIE, done)
  });

  it('should return Taco', function(done) {
    expectResponse('/pets/Taco', TACO_FULL, done);
  })

  it('should return Annie', function(done) {
    expectResponse('/owners/annie', ANNIE_FULL, done);
  })

  it('should return all pets', function(done) {
    expectResponse('/pets', [TACO_FULL], done);
  });

  it('should return all users', function(done) {
    expectResponse('/owners', [ANNIE_FULL], done);
  });

  it('should allow adding second user', function(done) {
    expectSuccess('post', '/owners', BOBBY, done);
  })

  it('should not allow pet edit without auth', function(done) {
    expectFailure('patch', '/pets', _.extend({type: 'dog'}, TACO), done);
  });

  it('should not allow pet edit by wrong user', function(done) {
    expectFailure('patch', '/pets', _.extend({type: 'dog'}, TACO), BOBBY, done);
  })

  it('should allow pet edit with auth', function(done) {
    expectSuccess('patch', '/pets', _.extend({type: 'dog'}, TACO), ANNIE, done)
  });

  it('should reflect edit', function(done) {
    expectResponse('/pets/' + TACO.name, _.extend({type: 'dog'}, TACO_FULL), done);
  })
})
