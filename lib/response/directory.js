// Load modules

var Fs = require('fs');
var Path = require('path');
var Cacheable = require('./cacheable');
var Boom = require('boom');
var File = require('./file');
var Utils = require('../utils');


// Declare internals

var internals = {};


// File response  (Base -> Generic -> Cacheable -> Directory)

exports = module.exports = internals.Directory = function (path, options) {

    Utils.assert(this.constructor === internals.Directory, 'Directory must be instantiated using new');
    Utils.assert(options, 'Options must exist');

    Cacheable.call(this);
    this.variety = 'directory';
    this.varieties.directory = true;

    this._path = Path.normalize(path);
    this._resource = options.resource;
    this._isRoot = options.isRoot;
    this._index = options.index === false ? false : true;       // Defaults to true
    this._listing = !!options.listing;                          // Defaults to false
    this._showHidden = !!options.showHidden;                    // Defaults to false

    return this;
};

Utils.inherits(internals.Directory, Cacheable);


internals.Directory.prototype._prepare = function (request, callback) {

    var self = this;

    this._wasPrepared = true;

    if (this._hideFile(this._path)) {                               // Don't serve hidden files when showHidden is disabled
        return callback(Boom.notFound());
    }

    // Lookup file

    (new File(this._path))._prepare(request, function (response) {

        // File loaded successfully

        if (response instanceof Error === false) {
            return callback(response);
        }

        // Not found

        var error = response;
        if (error.response.code !== 403) {
            return callback(error);
        }

        // Directory

        if (!self._index &&
            !self._listing) {

            return callback(Boom.forbidden());
        }

        if (!self._index) {
            return self._generateListing(request, callback);
        }

        var indexFile = Path.normalize(self._path + (self._path[self._path.length - 1] !== '/' ? '/' : '') + 'index.html');
        (new File(indexFile))._prepare(request, function (indexResponse) {

            // File loaded successfully

            if (indexResponse instanceof Error === false) {
                return callback(indexResponse);
            }

            // Directory

            var error = indexResponse;
            if (error.response.code !== 404) {
                return callback(Boom.internal('index.html is a directory'));
            }

            // Not found

            if (!self._listing) {
                return callback(Boom.forbidden());
            }

            return self._generateListing(request, callback);
        });
    });
};


internals.Directory.prototype._generateListing = function (request, callback) {

    var self = this;

    Fs.readdir(self._path, function (err, files) {

        if (err) {
            return callback(Boom.internal('Error accessing directory'));
        }

        var separator = '';
        var display = Utils.escapeHtml(self._resource);
        var html = '<html><head><title>' + display + '</title></head><body><h1>Directory: ' + display + '</h1><ul>';

        if (!self._isRoot) {
            separator = '/';
            var parent = self._resource.substring(0, self._resource.lastIndexOf('/')) || '/';
            html += '<li><a href="' + internals.pathEncode(parent) + '">Parent Directory</a></li>';
        }

        for (var i = 0, il = files.length; i < il; ++i) {
            if (!self._hideFile(files[i])) {
                html += '<li><a href="' + internals.pathEncode(self._resource + separator + files[i]) + '">' + Utils.escapeHtml(files[i]) + '</a></li>';
            }
        }

        html += '</ul></body></html>';

        self._payload = [html];
        self._headers['Content-Type'] = 'text/html';

        return Cacheable.prototype._prepare.call(self, request, callback);
    });
};


internals.Directory.prototype._hideFile = function (path) {

    return !this._showHidden && /^\./.test(Path.basename(path));
};


internals.pathEncode = function (path) {

    return encodeURIComponent(path).replace(/%2F/g, '/');
};

