var FS = require('fs');
var Path = require('path')
var Async = require('async');
var _ = require('underscore');
var Validator = new (require('jsonschema').Validator)();

var Collection = module.exports = function(name, dir, options) {
  var self = this;
  self.name = name;
  self.directory = dir;
  self.options = options;
  self.items = {};
  self.idField = self.options.id || 'id';
  if (self.options.schema) {
    self.options.schema.properties[self.idField] = {type: 'string'}
  }
  if (!FS.existsSync(dir)) FS.mkdirSync(dir);
  FS.readdirSync(dir).forEach(function(itemName) {
    self.items[itemName] = JSON.parse(FS.readFileSync(Path.join(dir, itemName, '_item.json'), 'utf8'));
  });
}

Collection.prototype.get = function(id) {
  var self = this;
  if (!id) return JSON.parse(JSON.stringify(_.values(self.items)));
  var item = self.items[id];
  if (!item) throw new Error("Item " + id + " not found");
  return JSON.parse(JSON.stringify(item));
}

Collection.prototype.validateData = function(data) {
  var self = this;
  var id = data[self.idField];
  if (!id) throw new Error("Identifier field " + self.idField + " not specified");
  if (self.options.schema) {
    var result = Validator.validate(data, self.options.schema);
    if (!result.valid) throw new Error(JSON.stringify(result.errors));
  }
  return id;
}

Collection.prototype.post = function(data) {
  var self = this;
  var id = self.validateData(data);
  if (self.items[id]) throw new Error("Item " + id + " already exists in " + self.name);
  self.items[id] = data;
  return id;
}

Collection.prototype.put = function(data) {
  var self = this;
  var id = self.validateData(data);
  self.items[id] = data;
  return id;
}

Collection.prototype.patch = function(data) {
  var self = this;
  var id = data[self.idField];
  if (!id) throw new Error("Identifier field " + self.idField + " not specified");
  var current = self.items[id];
  if (!current) throw new Error("Item " + id + " not found in " + self.name);
  return id;
}

Collection.prototype.delete = function(id) {
  var self = this;
  var item = self.items[id];
  if (!item) throw new Error("Item " + id + " not found");
  delete self.items[id];
  return id;
}

Collection.prototype.save = function(id, callback) {
  var item = this.items[id];
  var dir = Path.join(this.directory, id);
  var filename = Path.join(dir, '_item.json');
  if (item) {
    var writeItem = function() {
      FS.writeFile(filename, JSON.stringify(item, null, 2), callback);
    }
    FS.exists(dir, function(exists) {
      if (exists) return writeItem();
      FS.mkdir(dir, function(err) {
        if (err) return callback(err);
        writeItem();
      });
    });
  } else {
    FS.unlink(filename, function(err) {
      if (err) return callback(err);
      FS.rmdir(dir, callback);
    });
  }
}

Collection.prototype.reload = function(callback) {
  var self = this;
  self.items = {};
  FS.readdir(this.directory, function(err, files) {
    if (err) return callback (err);
    Async.parallel(files.map(function(itemName) {
      return function(acb) {
        FS.readFile(Path.join(self.directory, itemName, '_item.json'), 'utf8', function(err, data) {
          if (err) return acb(err);
          self.items[itemName] = JSON.parse(data);
          acb();
        });
      }
    }), callback);
  })
}
