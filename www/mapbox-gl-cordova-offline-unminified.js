/* Mapbox GL JS is licensed under the 3-Clause BSD License. Full text of license: https://github.com/mapbox/mapbox-gl-js/blob/v0.3.1/LICENSE.txt */
(function (global, factory) {
typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
typeof define === 'function' && define.amd ? define(factory) :
(global.mapboxgl = factory());
}(this, (function () { 'use strict';

/* eslint-disable */

var shared, worker, mapboxgl;
// define gets called three times: one for each chunk. we rely on the order
// they're imported to know which is which
function define(_, chunk) {
if (!shared) {
    shared = chunk;
} else if (!worker) {
    worker = chunk;
} else {
    var workerBundleString = 'var sharedChunk = {}; (' + shared + ')(sharedChunk); (' + worker + ')(sharedChunk);'

    var sharedChunk = {};
    shared(sharedChunk);
    mapboxgl = chunk(sharedChunk);
    mapboxgl.workerUrl = window.URL.createObjectURL(new Blob([workerBundleString], { type: 'text/javascript' }));
}
}

define(['exports', 'mapbox-gl/src/source/raster_tile_source', 'mapbox-gl/src/util/util', 'mapbox-gl/src/render/texture', 'mapbox-gl/src/source/raster_dem_tile_source', 'mapbox-gl/src/util/browser'], function (exports, RasterTileSource, util, Texture, RasterDEMTileSource, browser) { 'use strict';

RasterTileSource = RasterTileSource && RasterTileSource.hasOwnProperty('default') ? RasterTileSource['default'] : RasterTileSource;
Texture = Texture && Texture.hasOwnProperty('default') ? Texture['default'] : Texture;
RasterDEMTileSource = RasterDEMTileSource && RasterDEMTileSource.hasOwnProperty('default') ? RasterDEMTileSource['default'] : RasterDEMTileSource;
browser = browser && browser.hasOwnProperty('default') ? browser['default'] : browser;

var Database = function Database () {};

Database.getDatabaseDir = function getDatabaseDir () {
    if (!('sqlitePlugin' in self)) {
        return Promise.reject(new Error('cordova-sqlite-ext plugin not available. ' + 'Please install the plugin and make sure this code is run after onDeviceReady event'));
    }
    if (!('device' in self)) {
        return Promise.reject(new Error('cordova-plugin-device not available. ' + 'Please install the plugin and make sure this code is run after onDeviceReady event'));
    }
    return new Promise(function (resolve, reject) {
        if (device.platform === 'Android') {
            resolveLocalFileSystemURL(cordova.file.applicationStorageDirectory, function (dir) {
                dir.getDirectory('databases', { create: true }, function (subdir) {
                    resolve(subdir);
                });
            }, reject);
        } else if (device.platform === 'iOS') {
            resolveLocalFileSystemURL(cordova.file.documentsDirectory, resolve, reject);
        } else {
            reject('Platform not supported');
        }
    });
};
Database.openDatabase = function openDatabase (dbLocation) {
    var dbName = dbLocation.split('/').slice(-1)[0];
    var source = this;
    return this.getDatabaseDir().then(function (targetDir) {
        return new Promise(function (resolve, reject) {
            targetDir.getFile(dbName, {}, resolve, reject);
        }).catch(function () {
            return source.copyDatabaseFile(dbLocation, dbName, targetDir);
        });
    }).then(function () {
        var params = { name: dbName };
        if (device.platform === 'iOS') {
            params.iosDatabaseLocation = 'Documents';
        } else {
            params.location = 'default';
        }
        return sqlitePlugin.openDatabase(params);
    });
};
Database.copyDatabaseFile = function copyDatabaseFile (dbLocation, dbName, targetDir) {
    console.log('Copying database to application storage directory');
    return new Promise(function (resolve, reject) {
        var absPath = cordova.file.applicationDirectory + 'www/' + dbLocation;
        resolveLocalFileSystemURL(absPath, resolve, reject);
    }).then(function (sourceFile) {
        return new Promise(function (resolve, reject) {
            sourceFile.copyTo(targetDir, dbName, resolve, reject);
        }).then(function () {
            console.log('Database copied');
        });
    });
};

var RasterTileSourceOffline = (function (RasterTileSource$$1) {
    function RasterTileSourceOffline(id, options, dispatcher, eventedParent) {
        RasterTileSource$$1.call(this, id, options, dispatcher, eventedParent);
        this.id = id;
        this.dispatcher = dispatcher;
        this.setEventedParent(eventedParent);
        this.type = 'rasteroffline';
        this.minzoom = 0;
        this.maxzoom = 22;
        this.roundZoom = true;
        this.scheme = 'xyz';
        this.tileSize = 512;
        this.imageFormat = 'png';
        this._loaded = false;
        this._options = util.extend({}, options);
        util.extend(this, util.pick(options, [
            'scheme',
            'tileSize',
            'imageFormat'
        ]));
        this._transparentPngUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQYV2NgAAIAAAUAAarVyFEAAAAASUVORK5CYII=';
        this.db = this.openDatabase(options.path);
    }

    if ( RasterTileSource$$1 ) RasterTileSourceOffline.__proto__ = RasterTileSource$$1;
    RasterTileSourceOffline.prototype = Object.create( RasterTileSource$$1 && RasterTileSource$$1.prototype );
    RasterTileSourceOffline.prototype.constructor = RasterTileSourceOffline;
    RasterTileSourceOffline.prototype.openDatabase = function openDatabase (dbLocation) {
        return Database.openDatabase(dbLocation);
    };
    RasterTileSourceOffline.prototype.copyDatabaseFile = function copyDatabaseFile (dbLocation, dbName, targetDir) {
        return Database.copyDatabaseFile(dbLocation, dbName, targetDir);
    };
    RasterTileSourceOffline.prototype.loadTile = function loadTile (tile, callback) {
        tile.request = this._getImage(tile.tileID.canonical, done.bind(this));
        function done(err, img) {
            delete tile.request;
            if (tile.aborted && window.allowMapboxOfflineMapOnlineTile) {
                tile.state = 'unloaded';
                callback(null);
            } else if (err) {
                if (this.url) {
                    RasterTileSource$$1.prototype.loadTile.call(this, tile, callback);
                } else {
                    tile.state = 'errored';
                    callback(err);
                }
            } else if (img) {
                if (this.map._refreshExpiredTiles)
                    { tile.setExpiryData(img); }
                delete img.cacheControl;
                delete img.expires;
                var context = this.map.painter.context;
                var gl = context.gl;
                tile.texture = this.map.painter.getTileTexture(img.width);
                if (tile.texture) {
                    tile.texture.update(img, { useMipmap: true });
                } else {
                    tile.texture = new Texture(context, img, gl.RGBA, { useMipmap: true });
                    tile.texture.bind(gl.LINEAR, gl.CLAMP_TO_EDGE, gl.LINEAR_MIPMAP_NEAREST);
                    if (context.extTextureFilterAnisotropic) {
                        gl.texParameterf(gl.TEXTURE_2D, context.extTextureFilterAnisotropic.TEXTURE_MAX_ANISOTROPY_EXT, context.extTextureFilterAnisotropicMax);
                    }
                }
                tile.state = 'loaded';
                callback(null);
            }
        }
    };
    RasterTileSourceOffline.prototype._getBlob = function _getBlob (coord, callback) {
        var this$1 = this;

        var coordY = Math.pow(2, coord.z) - 1 - coord.y;
        var query = 'SELECT BASE64(tile_data) AS base64_tile_data FROM tiles WHERE zoom_level = ? AND tile_column = ? AND tile_row = ?';
        var params = [
            coord.z,
            coord.x,
            coordY
        ];
        var base64Prefix = 'data:image/' + this.imageFormat + ';base64,';
        this.db.then(function (db) {
            db.transaction(function (txn) {
                txn.executeSql(query, params, function (tx, res) {
                    if (res.rows.length) {
                        callback(undefined, {
                            data: base64Prefix + res.rows.item(0).base64_tile_data,
                            cacheControl: null,
                            expires: null
                        });
                    } else {
                        if (this$1.url) {
                            callback(new Error('tile ' + params.join(',') + ' not found'));
                        } else {
                            console.error('tile ' + params.join(',') + ' not found');
                            callback(undefined, {
                                data: this$1._transparentPngUrl,
                                cacheControl: null,
                                expires: null
                            });
                        }
                    }
                });
            }, function (error) {
                callback(error);
            });
        }).catch(function (err) {
            callback(err);
        });
    };
    RasterTileSourceOffline.prototype._getImage = function _getImage (coord, callback) {
        return this._getBlob(coord, function (err, imgData) {
            if (err)
                { return callback(err); }
            var img = new window.Image();
            var URL = window.URL || window.webkitURL;
            img.onload = function () {
                callback(null, img);
                URL.revokeObjectURL(img.src);
            };
            img.cacheControl = imgData.cacheControl;
            img.expires = imgData.expires;
            img.src = imgData.data;
        });
    };

    return RasterTileSourceOffline;
}(RasterTileSource));

var RasterDEMTileSourceOffline = (function (RasterDEMTileSource$$1) {
    function RasterDEMTileSourceOffline(id, options, dispatcher, eventedParent) {
        RasterDEMTileSource$$1.call(this, id, options, dispatcher, eventedParent);
        this.id = id;
        this.dispatcher = dispatcher;
        this.setEventedParent(eventedParent);
        this.type = 'raster-dem-offline';
        this.minzoom = 0;
        this.maxzoom = 22;
        this.roundZoom = true;
        this.scheme = 'xyz';
        this.tileSize = 512;
        this.imageFormat = 'png';
        this._loaded = false;
        this._options = util.extend({}, options);
        util.extend(this, util.pick(options, [
            'scheme',
            'tileSize',
            'imageFormat'
        ]));
        this._transparentPngUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQYV2NgAAIAAAUAAarVyFEAAAAASUVORK5CYII=';
        this.db = this.openDatabase(options.path);
    }

    if ( RasterDEMTileSource$$1 ) RasterDEMTileSourceOffline.__proto__ = RasterDEMTileSource$$1;
    RasterDEMTileSourceOffline.prototype = Object.create( RasterDEMTileSource$$1 && RasterDEMTileSource$$1.prototype );
    RasterDEMTileSourceOffline.prototype.constructor = RasterDEMTileSourceOffline;
    RasterDEMTileSourceOffline.prototype.openDatabase = function openDatabase (dbLocation) {
        return Database.openDatabase(dbLocation);
    };
    RasterDEMTileSourceOffline.prototype.copyDatabaseFile = function copyDatabaseFile (dbLocation, dbName, targetDir) {
        return Database.copyDatabaseFile(dbLocation, dbName, targetDir);
    };
    RasterDEMTileSourceOffline.prototype.loadTile = function loadTile (tile, callback) {
        tile.request = this._getImage(tile.tileID.canonical, imageLoaded.bind(this));
        tile.neighboringTiles = this._getNeighboringTiles(tile.tileID);
        function imageLoaded(err, img) {
            delete tile.request;
            if (tile.aborted) {
                tile.state = 'unloaded';
                callback(null);
            } else if (err) {
                if (this.url && window.allowMapboxOfflineMapOnlineTile) {
                    RasterDEMTileSource$$1.prototype.loadTile.call(this, tile, callback);
                } else {
                    tile.state = 'errored';
                    callback(err);
                }
            } else if (img) {
                if (this.map._refreshExpiredTiles)
                    { tile.setExpiryData(img); }
                delete img.cacheControl;
                delete img.expires;
                var rawImageData = browser.getImageData(img);
                var params = {
                    uid: tile.uid,
                    coord: tile.tileID,
                    source: this.id,
                    rawImageData: rawImageData,
                    encoding: this.encoding
                };
                if (!tile.workerID || tile.state === 'expired') {
                    tile.workerID = this.dispatcher.send('loadDEMTile', params, done.bind(this));
                }
            }
        }
        function done(err, dem) {
            if (err) {
                tile.state = 'errored';
                callback(err);
            }
            if (dem) {
                tile.dem = dem;
                tile.needsHillshadePrepare = true;
                tile.state = 'loaded';
                callback(null);
            }
        }
    };
    RasterDEMTileSourceOffline.prototype._getBlob = function _getBlob (coord, callback) {
        var this$1 = this;

        var coordY = Math.pow(2, coord.z) - 1 - coord.y;
        var query = 'SELECT BASE64(tile_data) AS base64_tile_data FROM tiles WHERE zoom_level = ? AND tile_column = ? AND tile_row = ?';
        var params = [
            coord.z,
            coord.x,
            coordY
        ];
        var base64Prefix = 'data:image/' + this.imageFormat + ';base64,';
        this.db.then(function (db) {
            db.transaction(function (txn) {
                txn.executeSql(query, params, function (tx, res) {
                    if (res.rows.length) {
                        callback(undefined, {
                            data: base64Prefix + res.rows.item(0).base64_tile_data,
                            cacheControl: null,
                            expires: null
                        });
                    } else {
                        if (this$1.url) {
                            callback(new Error('tile ' + params.join(',') + ' not found'));
                        } else {
                            console.error('tile ' + params.join(',') + ' not found');
                            callback(undefined, {
                                data: this$1._transparentPngUrl,
                                cacheControl: null,
                                expires: null
                            });
                        }
                    }
                });
            }, function (error) {
                callback(error);
            });
        }).catch(function (err) {
            callback(err);
        });
    };
    RasterDEMTileSourceOffline.prototype._getImage = function _getImage (coord, callback) {
        return this._getBlob(coord, function (err, imgData) {
            if (err)
                { return callback(err); }
            var img = new window.Image();
            var URL = window.URL || window.webkitURL;
            img.onload = function () {
                callback(null, img);
                URL.revokeObjectURL(img.src);
            };
            img.cacheControl = imgData.cacheControl;
            img.expires = imgData.expires;
            img.src = imgData.data;
        });
    };

    return RasterDEMTileSourceOffline;
}(RasterDEMTileSource));

exports.Database = Database;
exports.RasterTileSourceOffline = RasterTileSourceOffline;
exports.RasterDEMTileSourceOffline = RasterDEMTileSourceOffline;

});

define(['mapbox-gl/src/util/actor', 'mapbox-gl/src/style/style_layer_index', 'mapbox-gl/src/source/vector_tile_worker_source', 'mapbox-gl/src/source/raster_dem_tile_worker_source', './shared.js', 'mapbox-gl/src/source/geojson_worker_source', 'mapbox-gl/src/source/rtl_text_plugin', 'mapbox-gl/src/source/raster_tile_source', 'mapbox-gl/src/util/util', 'mapbox-gl/src/render/texture', 'mapbox-gl/src/source/raster_dem_tile_source', 'mapbox-gl/src/util/browser'], function (Actor, StyleLayerIndex, VectorTileWorkerSource, RasterDEMTileWorkerSource, __chunk_1, GeoJSONWorkerSource, rtl_text_plugin, RasterTileSource, util, Texture, RasterDEMTileSource, browser) { 'use strict';

Actor = Actor && Actor.hasOwnProperty('default') ? Actor['default'] : Actor;
StyleLayerIndex = StyleLayerIndex && StyleLayerIndex.hasOwnProperty('default') ? StyleLayerIndex['default'] : StyleLayerIndex;
VectorTileWorkerSource = VectorTileWorkerSource && VectorTileWorkerSource.hasOwnProperty('default') ? VectorTileWorkerSource['default'] : VectorTileWorkerSource;
RasterDEMTileWorkerSource = RasterDEMTileWorkerSource && RasterDEMTileWorkerSource.hasOwnProperty('default') ? RasterDEMTileWorkerSource['default'] : RasterDEMTileWorkerSource;
GeoJSONWorkerSource = GeoJSONWorkerSource && GeoJSONWorkerSource.hasOwnProperty('default') ? GeoJSONWorkerSource['default'] : GeoJSONWorkerSource;
RasterTileSource = RasterTileSource && RasterTileSource.hasOwnProperty('default') ? RasterTileSource['default'] : RasterTileSource;
Texture = Texture && Texture.hasOwnProperty('default') ? Texture['default'] : Texture;
RasterDEMTileSource = RasterDEMTileSource && RasterDEMTileSource.hasOwnProperty('default') ? RasterDEMTileSource['default'] : RasterDEMTileSource;
browser = browser && browser.hasOwnProperty('default') ? browser['default'] : browser;

var Worker = function Worker(self) {
    var this$1 = this;

    this.self = self;
    this.actor = new Actor(self, this);
    this.layerIndexes = {};
    this.workerSourceTypes = {
        vector: VectorTileWorkerSource,
        mbtiles: VectorTileWorkerSource,
        geojson: GeoJSONWorkerSource,
        rasteroffline: __chunk_1.RasterTileSourceOffline,
        'raster-dem-offline': __chunk_1.RasterDEMTileSourceOffline
    };
    this.workerSources = {};
    this.demWorkerSources = {};
    this.self.registerWorkerSource = function (name, WorkerSource) {
        if (this$1.workerSourceTypes[name]) {
            throw new Error(("Worker source with name \"" + name + "\" already registered."));
        }
        this$1.workerSourceTypes[name] = WorkerSource;
    };
    this.self.registerRTLTextPlugin = function (rtlTextPlugin) {
        if (rtl_text_plugin.plugin.isLoaded()) {
            throw new Error('RTL text plugin already registered.');
        }
        rtl_text_plugin.plugin['applyArabicShaping'] = rtlTextPlugin.applyArabicShaping;
        rtl_text_plugin.plugin['processBidirectionalText'] = rtlTextPlugin.processBidirectionalText;
        rtl_text_plugin.plugin['processStyledBidirectionalText'] = rtlTextPlugin.processStyledBidirectionalText;
    };
};
Worker.prototype.setReferrer = function setReferrer (mapID, referrer) {
    this.referrer = referrer;
};
Worker.prototype.setLayers = function setLayers (mapId, layers, callback) {
    this.getLayerIndex(mapId).replace(layers);
    callback();
};
Worker.prototype.updateLayers = function updateLayers (mapId, params, callback) {
    this.getLayerIndex(mapId).update(params.layers, params.removedIds);
    callback();
};
Worker.prototype.loadTile = function loadTile (mapId, params, callback) {
    this.getWorkerSource(mapId, params.type, params.source).loadTile(params, callback);
};
Worker.prototype.loadDEMTile = function loadDEMTile (mapId, params, callback) {
    this.getDEMWorkerSource(mapId, params.source).loadTile(params, callback);
};
Worker.prototype.reloadTile = function reloadTile (mapId, params, callback) {
    this.getWorkerSource(mapId, params.type, params.source).reloadTile(params, callback);
};
Worker.prototype.abortTile = function abortTile (mapId, params, callback) {
    this.getWorkerSource(mapId, params.type, params.source).abortTile(params, callback);
};
Worker.prototype.removeTile = function removeTile (mapId, params, callback) {
    this.getWorkerSource(mapId, params.type, params.source).removeTile(params, callback);
};
Worker.prototype.removeDEMTile = function removeDEMTile (mapId, params) {
    this.getDEMWorkerSource(mapId, params.source).removeTile(params);
};
Worker.prototype.removeSource = function removeSource (mapId, params, callback) {
    if (!this.workerSources[mapId] || !this.workerSources[mapId][params.type] || !this.workerSources[mapId][params.type][params.source]) {
        return;
    }
    var worker = this.workerSources[mapId][params.type][params.source];
    delete this.workerSources[mapId][params.type][params.source];
    if (worker.removeSource !== undefined) {
        worker.removeSource(params, callback);
    } else {
        callback();
    }
};
Worker.prototype.loadWorkerSource = function loadWorkerSource (map, params, callback) {
    try {
        this.self.importScripts(params.url);
        callback();
    } catch (e) {
        callback(e.toString());
    }
};
Worker.prototype.loadRTLTextPlugin = function loadRTLTextPlugin (map, pluginURL, callback) {
    try {
        if (!rtl_text_plugin.plugin.isLoaded()) {
            this.self.importScripts(pluginURL);
            callback(rtl_text_plugin.plugin.isLoaded() ? null : new Error(("RTL Text Plugin failed to import scripts from " + pluginURL)));
        }
    } catch (e) {
        callback(e.toString());
    }
};
Worker.prototype.getLayerIndex = function getLayerIndex (mapId) {
    var layerIndexes = this.layerIndexes[mapId];
    if (!layerIndexes) {
        layerIndexes = this.layerIndexes[mapId] = new StyleLayerIndex();
    }
    return layerIndexes;
};
Worker.prototype.getWorkerSource = function getWorkerSource (mapId, type, source) {
        var this$1 = this;

    if (!this.workerSources[mapId])
        { this.workerSources[mapId] = {}; }
    if (!this.workerSources[mapId][type])
        { this.workerSources[mapId][type] = {}; }
    if (!this.workerSources[mapId][type][source]) {
        var actor = {
            send: function (type, data, callback) {
                this$1.actor.send(type, data, callback, mapId);
            }
        };
        this.workerSources[mapId][type][source] = new this.workerSourceTypes[type](actor, this.getLayerIndex(mapId));
    }
    return this.workerSources[mapId][type][source];
};
Worker.prototype.getDEMWorkerSource = function getDEMWorkerSource (mapId, source) {
    if (!this.demWorkerSources[mapId])
        { this.demWorkerSources[mapId] = {}; }
    if (!this.demWorkerSources[mapId][source]) {
        this.demWorkerSources[mapId][source] = new RasterDEMTileWorkerSource();
    }
    return this.demWorkerSources[mapId][source];
};
if (typeof WorkerGlobalScope !== 'undefined' && typeof self !== 'undefined' && self instanceof WorkerGlobalScope) {
    self.worker = new Worker(self);
}

return Worker;

});

define(['mapbox-gl/src/source/vector_tile_source', './shared.js', 'mapbox-gl/src/ui/map', 'mapbox-gl/src/util/util', 'mapbox-gl/src/index', 'mapbox-gl/src/source/raster_tile_source', 'mapbox-gl/src/render/texture', 'mapbox-gl/src/source/raster_dem_tile_source', 'mapbox-gl/src/util/browser'], function (VectorTileSource, __chunk_1, Map, util, mapboxgl, RasterTileSource, Texture, RasterDEMTileSource, browser) { 'use strict';

VectorTileSource = VectorTileSource && VectorTileSource.hasOwnProperty('default') ? VectorTileSource['default'] : VectorTileSource;
Map = Map && Map.hasOwnProperty('default') ? Map['default'] : Map;
mapboxgl = mapboxgl && mapboxgl.hasOwnProperty('default') ? mapboxgl['default'] : mapboxgl;
RasterTileSource = RasterTileSource && RasterTileSource.hasOwnProperty('default') ? RasterTileSource['default'] : RasterTileSource;
Texture = Texture && Texture.hasOwnProperty('default') ? Texture['default'] : Texture;
RasterDEMTileSource = RasterDEMTileSource && RasterDEMTileSource.hasOwnProperty('default') ? RasterDEMTileSource['default'] : RasterDEMTileSource;
browser = browser && browser.hasOwnProperty('default') ? browser['default'] : browser;

function createCommonjsModule(fn, module) {
	return module = { exports: {} }, fn(module, module.exports), module.exports;
}

var common = createCommonjsModule(function (module, exports) {
var TYPED_OK = typeof Uint8Array !== 'undefined' && typeof Uint16Array !== 'undefined' && typeof Int32Array !== 'undefined';
function _has(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
}
exports.assign = function (obj) {
    var sources = Array.prototype.slice.call(arguments, 1);
    while (sources.length) {
        var source = sources.shift();
        if (!source) {
            continue;
        }
        if (typeof source !== 'object') {
            throw new TypeError(source + 'must be non-object');
        }
        for (var p in source) {
            if (_has(source, p)) {
                obj[p] = source[p];
            }
        }
    }
    return obj;
};
exports.shrinkBuf = function (buf, size) {
    if (buf.length === size) {
        return buf;
    }
    if (buf.subarray) {
        return buf.subarray(0, size);
    }
    buf.length = size;
    return buf;
};
var fnTyped = {
    arraySet: function (dest, src, src_offs, len, dest_offs) {
        if (src.subarray && dest.subarray) {
            dest.set(src.subarray(src_offs, src_offs + len), dest_offs);
            return;
        }
        for (var i = 0; i < len; i++) {
            dest[dest_offs + i] = src[src_offs + i];
        }
    },
    flattenChunks: function (chunks) {
        var i, l, len, pos, chunk, result;
        len = 0;
        for (i = 0, l = chunks.length; i < l; i++) {
            len += chunks[i].length;
        }
        result = new Uint8Array(len);
        pos = 0;
        for (i = 0, l = chunks.length; i < l; i++) {
            chunk = chunks[i];
            result.set(chunk, pos);
            pos += chunk.length;
        }
        return result;
    }
};
var fnUntyped = {
    arraySet: function (dest, src, src_offs, len, dest_offs) {
        for (var i = 0; i < len; i++) {
            dest[dest_offs + i] = src[src_offs + i];
        }
    },
    flattenChunks: function (chunks) {
        return [].concat.apply([], chunks);
    }
};
exports.setTyped = function (on) {
    if (on) {
        exports.Buf8 = Uint8Array;
        exports.Buf16 = Uint16Array;
        exports.Buf32 = Int32Array;
        exports.assign(exports, fnTyped);
    } else {
        exports.Buf8 = Array;
        exports.Buf16 = Array;
        exports.Buf32 = Array;
        exports.assign(exports, fnUntyped);
    }
};
exports.setTyped(TYPED_OK);
});
var common_1 = common.assign;
var common_2 = common.shrinkBuf;
var common_3 = common.setTyped;
var common_4 = common.Buf8;
var common_5 = common.Buf16;
var common_6 = common.Buf32;

function adler32(adler, buf, len, pos) {
    var s1 = adler & 65535 | 0, s2 = adler >>> 16 & 65535 | 0, n = 0;
    while (len !== 0) {
        n = len > 2000 ? 2000 : len;
        len -= n;
        do {
            s1 = s1 + buf[pos++] | 0;
            s2 = s2 + s1 | 0;
        } while (--n);
        s1 %= 65521;
        s2 %= 65521;
    }
    return s1 | s2 << 16 | 0;
}
var adler32_1 = adler32;

function makeTable() {
    var c, table = [];
    for (var n = 0; n < 256; n++) {
        c = n;
        for (var k = 0; k < 8; k++) {
            c = c & 1 ? 3988292384 ^ c >>> 1 : c >>> 1;
        }
        table[n] = c;
    }
    return table;
}
var crcTable = makeTable();
function crc32(crc, buf, len, pos) {
    var t = crcTable, end = pos + len;
    crc ^= -1;
    for (var i = pos; i < end; i++) {
        crc = crc >>> 8 ^ t[(crc ^ buf[i]) & 255];
    }
    return crc ^ -1;
}
var crc32_1 = crc32;

var BAD = 30;
var TYPE = 12;
var inffast = function inflate_fast(strm, start) {
    var state;
    var _in;
    var last;
    var _out;
    var beg;
    var end;
    var dmax;
    var wsize;
    var whave;
    var wnext;
    var s_window;
    var hold;
    var bits;
    var lcode;
    var dcode;
    var lmask;
    var dmask;
    var here;
    var op;
    var len;
    var dist;
    var from;
    var from_source;
    var input, output;
    state = strm.state;
    _in = strm.next_in;
    input = strm.input;
    last = _in + (strm.avail_in - 5);
    _out = strm.next_out;
    output = strm.output;
    beg = _out - (start - strm.avail_out);
    end = _out + (strm.avail_out - 257);
    dmax = state.dmax;
    wsize = state.wsize;
    whave = state.whave;
    wnext = state.wnext;
    s_window = state.window;
    hold = state.hold;
    bits = state.bits;
    lcode = state.lencode;
    dcode = state.distcode;
    lmask = (1 << state.lenbits) - 1;
    dmask = (1 << state.distbits) - 1;
    top:
        do {
            if (bits < 15) {
                hold += input[_in++] << bits;
                bits += 8;
                hold += input[_in++] << bits;
                bits += 8;
            }
            here = lcode[hold & lmask];
            dolen:
                for (;;) {
                    op = here >>> 24;
                    hold >>>= op;
                    bits -= op;
                    op = here >>> 16 & 255;
                    if (op === 0) {
                        output[_out++] = here & 65535;
                    } else if (op & 16) {
                        len = here & 65535;
                        op &= 15;
                        if (op) {
                            if (bits < op) {
                                hold += input[_in++] << bits;
                                bits += 8;
                            }
                            len += hold & (1 << op) - 1;
                            hold >>>= op;
                            bits -= op;
                        }
                        if (bits < 15) {
                            hold += input[_in++] << bits;
                            bits += 8;
                            hold += input[_in++] << bits;
                            bits += 8;
                        }
                        here = dcode[hold & dmask];
                        dodist:
                            for (;;) {
                                op = here >>> 24;
                                hold >>>= op;
                                bits -= op;
                                op = here >>> 16 & 255;
                                if (op & 16) {
                                    dist = here & 65535;
                                    op &= 15;
                                    if (bits < op) {
                                        hold += input[_in++] << bits;
                                        bits += 8;
                                        if (bits < op) {
                                            hold += input[_in++] << bits;
                                            bits += 8;
                                        }
                                    }
                                    dist += hold & (1 << op) - 1;
                                    if (dist > dmax) {
                                        strm.msg = 'invalid distance too far back';
                                        state.mode = BAD;
                                        break top;
                                    }
                                    hold >>>= op;
                                    bits -= op;
                                    op = _out - beg;
                                    if (dist > op) {
                                        op = dist - op;
                                        if (op > whave) {
                                            if (state.sane) {
                                                strm.msg = 'invalid distance too far back';
                                                state.mode = BAD;
                                                break top;
                                            }
                                        }
                                        from = 0;
                                        from_source = s_window;
                                        if (wnext === 0) {
                                            from += wsize - op;
                                            if (op < len) {
                                                len -= op;
                                                do {
                                                    output[_out++] = s_window[from++];
                                                } while (--op);
                                                from = _out - dist;
                                                from_source = output;
                                            }
                                        } else if (wnext < op) {
                                            from += wsize + wnext - op;
                                            op -= wnext;
                                            if (op < len) {
                                                len -= op;
                                                do {
                                                    output[_out++] = s_window[from++];
                                                } while (--op);
                                                from = 0;
                                                if (wnext < len) {
                                                    op = wnext;
                                                    len -= op;
                                                    do {
                                                        output[_out++] = s_window[from++];
                                                    } while (--op);
                                                    from = _out - dist;
                                                    from_source = output;
                                                }
                                            }
                                        } else {
                                            from += wnext - op;
                                            if (op < len) {
                                                len -= op;
                                                do {
                                                    output[_out++] = s_window[from++];
                                                } while (--op);
                                                from = _out - dist;
                                                from_source = output;
                                            }
                                        }
                                        while (len > 2) {
                                            output[_out++] = from_source[from++];
                                            output[_out++] = from_source[from++];
                                            output[_out++] = from_source[from++];
                                            len -= 3;
                                        }
                                        if (len) {
                                            output[_out++] = from_source[from++];
                                            if (len > 1) {
                                                output[_out++] = from_source[from++];
                                            }
                                        }
                                    } else {
                                        from = _out - dist;
                                        do {
                                            output[_out++] = output[from++];
                                            output[_out++] = output[from++];
                                            output[_out++] = output[from++];
                                            len -= 3;
                                        } while (len > 2);
                                        if (len) {
                                            output[_out++] = output[from++];
                                            if (len > 1) {
                                                output[_out++] = output[from++];
                                            }
                                        }
                                    }
                                } else if ((op & 64) === 0) {
                                    here = dcode[(here & 65535) + (hold & (1 << op) - 1)];
                                    continue dodist;
                                } else {
                                    strm.msg = 'invalid distance code';
                                    state.mode = BAD;
                                    break top;
                                }
                                break;
                            }
                    } else if ((op & 64) === 0) {
                        here = lcode[(here & 65535) + (hold & (1 << op) - 1)];
                        continue dolen;
                    } else if (op & 32) {
                        state.mode = TYPE;
                        break top;
                    } else {
                        strm.msg = 'invalid literal/length code';
                        state.mode = BAD;
                        break top;
                    }
                    break;
                }
        } while (_in < last && _out < end);
    len = bits >> 3;
    _in -= len;
    bits -= len << 3;
    hold &= (1 << bits) - 1;
    strm.next_in = _in;
    strm.next_out = _out;
    strm.avail_in = _in < last ? 5 + (last - _in) : 5 - (_in - last);
    strm.avail_out = _out < end ? 257 + (end - _out) : 257 - (_out - end);
    state.hold = hold;
    state.bits = bits;
    return;
};

var MAXBITS = 15;
var ENOUGH_LENS = 852;
var ENOUGH_DISTS = 592;
var CODES = 0;
var LENS = 1;
var DISTS = 2;
var lbase = [
    3,
    4,
    5,
    6,
    7,
    8,
    9,
    10,
    11,
    13,
    15,
    17,
    19,
    23,
    27,
    31,
    35,
    43,
    51,
    59,
    67,
    83,
    99,
    115,
    131,
    163,
    195,
    227,
    258,
    0,
    0
];
var lext = [
    16,
    16,
    16,
    16,
    16,
    16,
    16,
    16,
    17,
    17,
    17,
    17,
    18,
    18,
    18,
    18,
    19,
    19,
    19,
    19,
    20,
    20,
    20,
    20,
    21,
    21,
    21,
    21,
    16,
    72,
    78
];
var dbase = [
    1,
    2,
    3,
    4,
    5,
    7,
    9,
    13,
    17,
    25,
    33,
    49,
    65,
    97,
    129,
    193,
    257,
    385,
    513,
    769,
    1025,
    1537,
    2049,
    3073,
    4097,
    6145,
    8193,
    12289,
    16385,
    24577,
    0,
    0
];
var dext = [
    16,
    16,
    16,
    16,
    17,
    17,
    18,
    18,
    19,
    19,
    20,
    20,
    21,
    21,
    22,
    22,
    23,
    23,
    24,
    24,
    25,
    25,
    26,
    26,
    27,
    27,
    28,
    28,
    29,
    29,
    64,
    64
];
var inftrees = function inflate_table(type, lens, lens_index, codes, table, table_index, work, opts) {
    var bits = opts.bits;
    var len = 0;
    var sym = 0;
    var min = 0, max = 0;
    var root = 0;
    var curr = 0;
    var drop = 0;
    var left = 0;
    var used = 0;
    var huff = 0;
    var incr;
    var fill;
    var low;
    var mask;
    var next;
    var base = null;
    var base_index = 0;
    var end;
    var count = new common.Buf16(MAXBITS + 1);
    var offs = new common.Buf16(MAXBITS + 1);
    var extra = null;
    var extra_index = 0;
    var here_bits, here_op, here_val;
    for (len = 0; len <= MAXBITS; len++) {
        count[len] = 0;
    }
    for (sym = 0; sym < codes; sym++) {
        count[lens[lens_index + sym]]++;
    }
    root = bits;
    for (max = MAXBITS; max >= 1; max--) {
        if (count[max] !== 0) {
            break;
        }
    }
    if (root > max) {
        root = max;
    }
    if (max === 0) {
        table[table_index++] = 1 << 24 | 64 << 16 | 0;
        table[table_index++] = 1 << 24 | 64 << 16 | 0;
        opts.bits = 1;
        return 0;
    }
    for (min = 1; min < max; min++) {
        if (count[min] !== 0) {
            break;
        }
    }
    if (root < min) {
        root = min;
    }
    left = 1;
    for (len = 1; len <= MAXBITS; len++) {
        left <<= 1;
        left -= count[len];
        if (left < 0) {
            return -1;
        }
    }
    if (left > 0 && (type === CODES || max !== 1)) {
        return -1;
    }
    offs[1] = 0;
    for (len = 1; len < MAXBITS; len++) {
        offs[len + 1] = offs[len] + count[len];
    }
    for (sym = 0; sym < codes; sym++) {
        if (lens[lens_index + sym] !== 0) {
            work[offs[lens[lens_index + sym]]++] = sym;
        }
    }
    if (type === CODES) {
        base = extra = work;
        end = 19;
    } else if (type === LENS) {
        base = lbase;
        base_index -= 257;
        extra = lext;
        extra_index -= 257;
        end = 256;
    } else {
        base = dbase;
        extra = dext;
        end = -1;
    }
    huff = 0;
    sym = 0;
    len = min;
    next = table_index;
    curr = root;
    drop = 0;
    low = -1;
    used = 1 << root;
    mask = used - 1;
    if (type === LENS && used > ENOUGH_LENS || type === DISTS && used > ENOUGH_DISTS) {
        return 1;
    }
    for (;;) {
        here_bits = len - drop;
        if (work[sym] < end) {
            here_op = 0;
            here_val = work[sym];
        } else if (work[sym] > end) {
            here_op = extra[extra_index + work[sym]];
            here_val = base[base_index + work[sym]];
        } else {
            here_op = 32 + 64;
            here_val = 0;
        }
        incr = 1 << len - drop;
        fill = 1 << curr;
        min = fill;
        do {
            fill -= incr;
            table[next + (huff >> drop) + fill] = here_bits << 24 | here_op << 16 | here_val | 0;
        } while (fill !== 0);
        incr = 1 << len - 1;
        while (huff & incr) {
            incr >>= 1;
        }
        if (incr !== 0) {
            huff &= incr - 1;
            huff += incr;
        } else {
            huff = 0;
        }
        sym++;
        if (--count[len] === 0) {
            if (len === max) {
                break;
            }
            len = lens[lens_index + work[sym]];
        }
        if (len > root && (huff & mask) !== low) {
            if (drop === 0) {
                drop = root;
            }
            next += min;
            curr = len - drop;
            left = 1 << curr;
            while (curr + drop < max) {
                left -= count[curr + drop];
                if (left <= 0) {
                    break;
                }
                curr++;
                left <<= 1;
            }
            used += 1 << curr;
            if (type === LENS && used > ENOUGH_LENS || type === DISTS && used > ENOUGH_DISTS) {
                return 1;
            }
            low = huff & mask;
            table[low] = root << 24 | curr << 16 | next - table_index | 0;
        }
    }
    if (huff !== 0) {
        table[next + huff] = len - drop << 24 | 64 << 16 | 0;
    }
    opts.bits = root;
    return 0;
};

var CODES$1 = 0;
var LENS$1 = 1;
var DISTS$1 = 2;
var Z_FINISH = 4;
var Z_BLOCK = 5;
var Z_TREES = 6;
var Z_OK = 0;
var Z_STREAM_END = 1;
var Z_NEED_DICT = 2;
var Z_STREAM_ERROR = -2;
var Z_DATA_ERROR = -3;
var Z_MEM_ERROR = -4;
var Z_BUF_ERROR = -5;
var Z_DEFLATED = 8;
var HEAD = 1;
var FLAGS = 2;
var TIME = 3;
var OS = 4;
var EXLEN = 5;
var EXTRA = 6;
var NAME = 7;
var COMMENT = 8;
var HCRC = 9;
var DICTID = 10;
var DICT = 11;
var TYPE$1 = 12;
var TYPEDO = 13;
var STORED = 14;
var COPY_ = 15;
var COPY = 16;
var TABLE = 17;
var LENLENS = 18;
var CODELENS = 19;
var LEN_ = 20;
var LEN = 21;
var LENEXT = 22;
var DIST = 23;
var DISTEXT = 24;
var MATCH = 25;
var LIT = 26;
var CHECK = 27;
var LENGTH = 28;
var DONE = 29;
var BAD$1 = 30;
var MEM = 31;
var SYNC = 32;
var ENOUGH_LENS$1 = 852;
var ENOUGH_DISTS$1 = 592;
var MAX_WBITS = 15;
var DEF_WBITS = MAX_WBITS;
function zswap32(q) {
    return (q >>> 24 & 255) + (q >>> 8 & 65280) + ((q & 65280) << 8) + ((q & 255) << 24);
}
function InflateState() {
    this.mode = 0;
    this.last = false;
    this.wrap = 0;
    this.havedict = false;
    this.flags = 0;
    this.dmax = 0;
    this.check = 0;
    this.total = 0;
    this.head = null;
    this.wbits = 0;
    this.wsize = 0;
    this.whave = 0;
    this.wnext = 0;
    this.window = null;
    this.hold = 0;
    this.bits = 0;
    this.length = 0;
    this.offset = 0;
    this.extra = 0;
    this.lencode = null;
    this.distcode = null;
    this.lenbits = 0;
    this.distbits = 0;
    this.ncode = 0;
    this.nlen = 0;
    this.ndist = 0;
    this.have = 0;
    this.next = null;
    this.lens = new common.Buf16(320);
    this.work = new common.Buf16(288);
    this.lendyn = null;
    this.distdyn = null;
    this.sane = 0;
    this.back = 0;
    this.was = 0;
}
function inflateResetKeep(strm) {
    var state;
    if (!strm || !strm.state) {
        return Z_STREAM_ERROR;
    }
    state = strm.state;
    strm.total_in = strm.total_out = state.total = 0;
    strm.msg = '';
    if (state.wrap) {
        strm.adler = state.wrap & 1;
    }
    state.mode = HEAD;
    state.last = 0;
    state.havedict = 0;
    state.dmax = 32768;
    state.head = null;
    state.hold = 0;
    state.bits = 0;
    state.lencode = state.lendyn = new common.Buf32(ENOUGH_LENS$1);
    state.distcode = state.distdyn = new common.Buf32(ENOUGH_DISTS$1);
    state.sane = 1;
    state.back = -1;
    return Z_OK;
}
function inflateReset(strm) {
    var state;
    if (!strm || !strm.state) {
        return Z_STREAM_ERROR;
    }
    state = strm.state;
    state.wsize = 0;
    state.whave = 0;
    state.wnext = 0;
    return inflateResetKeep(strm);
}
function inflateReset2(strm, windowBits) {
    var wrap;
    var state;
    if (!strm || !strm.state) {
        return Z_STREAM_ERROR;
    }
    state = strm.state;
    if (windowBits < 0) {
        wrap = 0;
        windowBits = -windowBits;
    } else {
        wrap = (windowBits >> 4) + 1;
        if (windowBits < 48) {
            windowBits &= 15;
        }
    }
    if (windowBits && (windowBits < 8 || windowBits > 15)) {
        return Z_STREAM_ERROR;
    }
    if (state.window !== null && state.wbits !== windowBits) {
        state.window = null;
    }
    state.wrap = wrap;
    state.wbits = windowBits;
    return inflateReset(strm);
}
function inflateInit2(strm, windowBits) {
    var ret;
    var state;
    if (!strm) {
        return Z_STREAM_ERROR;
    }
    state = new InflateState();
    strm.state = state;
    state.window = null;
    ret = inflateReset2(strm, windowBits);
    if (ret !== Z_OK) {
        strm.state = null;
    }
    return ret;
}
function inflateInit(strm) {
    return inflateInit2(strm, DEF_WBITS);
}
var virgin = true;
var lenfix, distfix;
function fixedtables(state) {
    if (virgin) {
        var sym;
        lenfix = new common.Buf32(512);
        distfix = new common.Buf32(32);
        sym = 0;
        while (sym < 144) {
            state.lens[sym++] = 8;
        }
        while (sym < 256) {
            state.lens[sym++] = 9;
        }
        while (sym < 280) {
            state.lens[sym++] = 7;
        }
        while (sym < 288) {
            state.lens[sym++] = 8;
        }
        inftrees(LENS$1, state.lens, 0, 288, lenfix, 0, state.work, { bits: 9 });
        sym = 0;
        while (sym < 32) {
            state.lens[sym++] = 5;
        }
        inftrees(DISTS$1, state.lens, 0, 32, distfix, 0, state.work, { bits: 5 });
        virgin = false;
    }
    state.lencode = lenfix;
    state.lenbits = 9;
    state.distcode = distfix;
    state.distbits = 5;
}
function updatewindow(strm, src, end, copy) {
    var dist;
    var state = strm.state;
    if (state.window === null) {
        state.wsize = 1 << state.wbits;
        state.wnext = 0;
        state.whave = 0;
        state.window = new common.Buf8(state.wsize);
    }
    if (copy >= state.wsize) {
        common.arraySet(state.window, src, end - state.wsize, state.wsize, 0);
        state.wnext = 0;
        state.whave = state.wsize;
    } else {
        dist = state.wsize - state.wnext;
        if (dist > copy) {
            dist = copy;
        }
        common.arraySet(state.window, src, end - copy, dist, state.wnext);
        copy -= dist;
        if (copy) {
            common.arraySet(state.window, src, end - copy, copy, 0);
            state.wnext = copy;
            state.whave = state.wsize;
        } else {
            state.wnext += dist;
            if (state.wnext === state.wsize) {
                state.wnext = 0;
            }
            if (state.whave < state.wsize) {
                state.whave += dist;
            }
        }
    }
    return 0;
}
function inflate(strm, flush) {
    var state;
    var input, output;
    var next;
    var put;
    var have, left;
    var hold;
    var bits;
    var _in, _out;
    var copy;
    var from;
    var from_source;
    var here = 0;
    var here_bits, here_op, here_val;
    var last_bits, last_op, last_val;
    var len;
    var ret;
    var hbuf = new common.Buf8(4);
    var opts;
    var n;
    var order = [
        16,
        17,
        18,
        0,
        8,
        7,
        9,
        6,
        10,
        5,
        11,
        4,
        12,
        3,
        13,
        2,
        14,
        1,
        15
    ];
    if (!strm || !strm.state || !strm.output || !strm.input && strm.avail_in !== 0) {
        return Z_STREAM_ERROR;
    }
    state = strm.state;
    if (state.mode === TYPE$1) {
        state.mode = TYPEDO;
    }
    put = strm.next_out;
    output = strm.output;
    left = strm.avail_out;
    next = strm.next_in;
    input = strm.input;
    have = strm.avail_in;
    hold = state.hold;
    bits = state.bits;
    _in = have;
    _out = left;
    ret = Z_OK;
    inf_leave:
        for (;;) {
            switch (state.mode) {
            case HEAD:
                if (state.wrap === 0) {
                    state.mode = TYPEDO;
                    break;
                }
                while (bits < 16) {
                    if (have === 0) {
                        break inf_leave;
                    }
                    have--;
                    hold += input[next++] << bits;
                    bits += 8;
                }
                if (state.wrap & 2 && hold === 35615) {
                    state.check = 0;
                    hbuf[0] = hold & 255;
                    hbuf[1] = hold >>> 8 & 255;
                    state.check = crc32_1(state.check, hbuf, 2, 0);
                    hold = 0;
                    bits = 0;
                    state.mode = FLAGS;
                    break;
                }
                state.flags = 0;
                if (state.head) {
                    state.head.done = false;
                }
                if (!(state.wrap & 1) || (((hold & 255) << 8) + (hold >> 8)) % 31) {
                    strm.msg = 'incorrect header check';
                    state.mode = BAD$1;
                    break;
                }
                if ((hold & 15) !== Z_DEFLATED) {
                    strm.msg = 'unknown compression method';
                    state.mode = BAD$1;
                    break;
                }
                hold >>>= 4;
                bits -= 4;
                len = (hold & 15) + 8;
                if (state.wbits === 0) {
                    state.wbits = len;
                } else if (len > state.wbits) {
                    strm.msg = 'invalid window size';
                    state.mode = BAD$1;
                    break;
                }
                state.dmax = 1 << len;
                strm.adler = state.check = 1;
                state.mode = hold & 512 ? DICTID : TYPE$1;
                hold = 0;
                bits = 0;
                break;
            case FLAGS:
                while (bits < 16) {
                    if (have === 0) {
                        break inf_leave;
                    }
                    have--;
                    hold += input[next++] << bits;
                    bits += 8;
                }
                state.flags = hold;
                if ((state.flags & 255) !== Z_DEFLATED) {
                    strm.msg = 'unknown compression method';
                    state.mode = BAD$1;
                    break;
                }
                if (state.flags & 57344) {
                    strm.msg = 'unknown header flags set';
                    state.mode = BAD$1;
                    break;
                }
                if (state.head) {
                    state.head.text = hold >> 8 & 1;
                }
                if (state.flags & 512) {
                    hbuf[0] = hold & 255;
                    hbuf[1] = hold >>> 8 & 255;
                    state.check = crc32_1(state.check, hbuf, 2, 0);
                }
                hold = 0;
                bits = 0;
                state.mode = TIME;
            case TIME:
                while (bits < 32) {
                    if (have === 0) {
                        break inf_leave;
                    }
                    have--;
                    hold += input[next++] << bits;
                    bits += 8;
                }
                if (state.head) {
                    state.head.time = hold;
                }
                if (state.flags & 512) {
                    hbuf[0] = hold & 255;
                    hbuf[1] = hold >>> 8 & 255;
                    hbuf[2] = hold >>> 16 & 255;
                    hbuf[3] = hold >>> 24 & 255;
                    state.check = crc32_1(state.check, hbuf, 4, 0);
                }
                hold = 0;
                bits = 0;
                state.mode = OS;
            case OS:
                while (bits < 16) {
                    if (have === 0) {
                        break inf_leave;
                    }
                    have--;
                    hold += input[next++] << bits;
                    bits += 8;
                }
                if (state.head) {
                    state.head.xflags = hold & 255;
                    state.head.os = hold >> 8;
                }
                if (state.flags & 512) {
                    hbuf[0] = hold & 255;
                    hbuf[1] = hold >>> 8 & 255;
                    state.check = crc32_1(state.check, hbuf, 2, 0);
                }
                hold = 0;
                bits = 0;
                state.mode = EXLEN;
            case EXLEN:
                if (state.flags & 1024) {
                    while (bits < 16) {
                        if (have === 0) {
                            break inf_leave;
                        }
                        have--;
                        hold += input[next++] << bits;
                        bits += 8;
                    }
                    state.length = hold;
                    if (state.head) {
                        state.head.extra_len = hold;
                    }
                    if (state.flags & 512) {
                        hbuf[0] = hold & 255;
                        hbuf[1] = hold >>> 8 & 255;
                        state.check = crc32_1(state.check, hbuf, 2, 0);
                    }
                    hold = 0;
                    bits = 0;
                } else if (state.head) {
                    state.head.extra = null;
                }
                state.mode = EXTRA;
            case EXTRA:
                if (state.flags & 1024) {
                    copy = state.length;
                    if (copy > have) {
                        copy = have;
                    }
                    if (copy) {
                        if (state.head) {
                            len = state.head.extra_len - state.length;
                            if (!state.head.extra) {
                                state.head.extra = new Array(state.head.extra_len);
                            }
                            common.arraySet(state.head.extra, input, next, copy, len);
                        }
                        if (state.flags & 512) {
                            state.check = crc32_1(state.check, input, copy, next);
                        }
                        have -= copy;
                        next += copy;
                        state.length -= copy;
                    }
                    if (state.length) {
                        break inf_leave;
                    }
                }
                state.length = 0;
                state.mode = NAME;
            case NAME:
                if (state.flags & 2048) {
                    if (have === 0) {
                        break inf_leave;
                    }
                    copy = 0;
                    do {
                        len = input[next + copy++];
                        if (state.head && len && state.length < 65536) {
                            state.head.name += String.fromCharCode(len);
                        }
                    } while (len && copy < have);
                    if (state.flags & 512) {
                        state.check = crc32_1(state.check, input, copy, next);
                    }
                    have -= copy;
                    next += copy;
                    if (len) {
                        break inf_leave;
                    }
                } else if (state.head) {
                    state.head.name = null;
                }
                state.length = 0;
                state.mode = COMMENT;
            case COMMENT:
                if (state.flags & 4096) {
                    if (have === 0) {
                        break inf_leave;
                    }
                    copy = 0;
                    do {
                        len = input[next + copy++];
                        if (state.head && len && state.length < 65536) {
                            state.head.comment += String.fromCharCode(len);
                        }
                    } while (len && copy < have);
                    if (state.flags & 512) {
                        state.check = crc32_1(state.check, input, copy, next);
                    }
                    have -= copy;
                    next += copy;
                    if (len) {
                        break inf_leave;
                    }
                } else if (state.head) {
                    state.head.comment = null;
                }
                state.mode = HCRC;
            case HCRC:
                if (state.flags & 512) {
                    while (bits < 16) {
                        if (have === 0) {
                            break inf_leave;
                        }
                        have--;
                        hold += input[next++] << bits;
                        bits += 8;
                    }
                    if (hold !== (state.check & 65535)) {
                        strm.msg = 'header crc mismatch';
                        state.mode = BAD$1;
                        break;
                    }
                    hold = 0;
                    bits = 0;
                }
                if (state.head) {
                    state.head.hcrc = state.flags >> 9 & 1;
                    state.head.done = true;
                }
                strm.adler = state.check = 0;
                state.mode = TYPE$1;
                break;
            case DICTID:
                while (bits < 32) {
                    if (have === 0) {
                        break inf_leave;
                    }
                    have--;
                    hold += input[next++] << bits;
                    bits += 8;
                }
                strm.adler = state.check = zswap32(hold);
                hold = 0;
                bits = 0;
                state.mode = DICT;
            case DICT:
                if (state.havedict === 0) {
                    strm.next_out = put;
                    strm.avail_out = left;
                    strm.next_in = next;
                    strm.avail_in = have;
                    state.hold = hold;
                    state.bits = bits;
                    return Z_NEED_DICT;
                }
                strm.adler = state.check = 1;
                state.mode = TYPE$1;
            case TYPE$1:
                if (flush === Z_BLOCK || flush === Z_TREES) {
                    break inf_leave;
                }
            case TYPEDO:
                if (state.last) {
                    hold >>>= bits & 7;
                    bits -= bits & 7;
                    state.mode = CHECK;
                    break;
                }
                while (bits < 3) {
                    if (have === 0) {
                        break inf_leave;
                    }
                    have--;
                    hold += input[next++] << bits;
                    bits += 8;
                }
                state.last = hold & 1;
                hold >>>= 1;
                bits -= 1;
                switch (hold & 3) {
                case 0:
                    state.mode = STORED;
                    break;
                case 1:
                    fixedtables(state);
                    state.mode = LEN_;
                    if (flush === Z_TREES) {
                        hold >>>= 2;
                        bits -= 2;
                        break inf_leave;
                    }
                    break;
                case 2:
                    state.mode = TABLE;
                    break;
                case 3:
                    strm.msg = 'invalid block type';
                    state.mode = BAD$1;
                }
                hold >>>= 2;
                bits -= 2;
                break;
            case STORED:
                hold >>>= bits & 7;
                bits -= bits & 7;
                while (bits < 32) {
                    if (have === 0) {
                        break inf_leave;
                    }
                    have--;
                    hold += input[next++] << bits;
                    bits += 8;
                }
                if ((hold & 65535) !== (hold >>> 16 ^ 65535)) {
                    strm.msg = 'invalid stored block lengths';
                    state.mode = BAD$1;
                    break;
                }
                state.length = hold & 65535;
                hold = 0;
                bits = 0;
                state.mode = COPY_;
                if (flush === Z_TREES) {
                    break inf_leave;
                }
            case COPY_:
                state.mode = COPY;
            case COPY:
                copy = state.length;
                if (copy) {
                    if (copy > have) {
                        copy = have;
                    }
                    if (copy > left) {
                        copy = left;
                    }
                    if (copy === 0) {
                        break inf_leave;
                    }
                    common.arraySet(output, input, next, copy, put);
                    have -= copy;
                    next += copy;
                    left -= copy;
                    put += copy;
                    state.length -= copy;
                    break;
                }
                state.mode = TYPE$1;
                break;
            case TABLE:
                while (bits < 14) {
                    if (have === 0) {
                        break inf_leave;
                    }
                    have--;
                    hold += input[next++] << bits;
                    bits += 8;
                }
                state.nlen = (hold & 31) + 257;
                hold >>>= 5;
                bits -= 5;
                state.ndist = (hold & 31) + 1;
                hold >>>= 5;
                bits -= 5;
                state.ncode = (hold & 15) + 4;
                hold >>>= 4;
                bits -= 4;
                if (state.nlen > 286 || state.ndist > 30) {
                    strm.msg = 'too many length or distance symbols';
                    state.mode = BAD$1;
                    break;
                }
                state.have = 0;
                state.mode = LENLENS;
            case LENLENS:
                while (state.have < state.ncode) {
                    while (bits < 3) {
                        if (have === 0) {
                            break inf_leave;
                        }
                        have--;
                        hold += input[next++] << bits;
                        bits += 8;
                    }
                    state.lens[order[state.have++]] = hold & 7;
                    hold >>>= 3;
                    bits -= 3;
                }
                while (state.have < 19) {
                    state.lens[order[state.have++]] = 0;
                }
                state.lencode = state.lendyn;
                state.lenbits = 7;
                opts = { bits: state.lenbits };
                ret = inftrees(CODES$1, state.lens, 0, 19, state.lencode, 0, state.work, opts);
                state.lenbits = opts.bits;
                if (ret) {
                    strm.msg = 'invalid code lengths set';
                    state.mode = BAD$1;
                    break;
                }
                state.have = 0;
                state.mode = CODELENS;
            case CODELENS:
                while (state.have < state.nlen + state.ndist) {
                    for (;;) {
                        here = state.lencode[hold & (1 << state.lenbits) - 1];
                        here_bits = here >>> 24;
                        here_op = here >>> 16 & 255;
                        here_val = here & 65535;
                        if (here_bits <= bits) {
                            break;
                        }
                        if (have === 0) {
                            break inf_leave;
                        }
                        have--;
                        hold += input[next++] << bits;
                        bits += 8;
                    }
                    if (here_val < 16) {
                        hold >>>= here_bits;
                        bits -= here_bits;
                        state.lens[state.have++] = here_val;
                    } else {
                        if (here_val === 16) {
                            n = here_bits + 2;
                            while (bits < n) {
                                if (have === 0) {
                                    break inf_leave;
                                }
                                have--;
                                hold += input[next++] << bits;
                                bits += 8;
                            }
                            hold >>>= here_bits;
                            bits -= here_bits;
                            if (state.have === 0) {
                                strm.msg = 'invalid bit length repeat';
                                state.mode = BAD$1;
                                break;
                            }
                            len = state.lens[state.have - 1];
                            copy = 3 + (hold & 3);
                            hold >>>= 2;
                            bits -= 2;
                        } else if (here_val === 17) {
                            n = here_bits + 3;
                            while (bits < n) {
                                if (have === 0) {
                                    break inf_leave;
                                }
                                have--;
                                hold += input[next++] << bits;
                                bits += 8;
                            }
                            hold >>>= here_bits;
                            bits -= here_bits;
                            len = 0;
                            copy = 3 + (hold & 7);
                            hold >>>= 3;
                            bits -= 3;
                        } else {
                            n = here_bits + 7;
                            while (bits < n) {
                                if (have === 0) {
                                    break inf_leave;
                                }
                                have--;
                                hold += input[next++] << bits;
                                bits += 8;
                            }
                            hold >>>= here_bits;
                            bits -= here_bits;
                            len = 0;
                            copy = 11 + (hold & 127);
                            hold >>>= 7;
                            bits -= 7;
                        }
                        if (state.have + copy > state.nlen + state.ndist) {
                            strm.msg = 'invalid bit length repeat';
                            state.mode = BAD$1;
                            break;
                        }
                        while (copy--) {
                            state.lens[state.have++] = len;
                        }
                    }
                }
                if (state.mode === BAD$1) {
                    break;
                }
                if (state.lens[256] === 0) {
                    strm.msg = 'invalid code -- missing end-of-block';
                    state.mode = BAD$1;
                    break;
                }
                state.lenbits = 9;
                opts = { bits: state.lenbits };
                ret = inftrees(LENS$1, state.lens, 0, state.nlen, state.lencode, 0, state.work, opts);
                state.lenbits = opts.bits;
                if (ret) {
                    strm.msg = 'invalid literal/lengths set';
                    state.mode = BAD$1;
                    break;
                }
                state.distbits = 6;
                state.distcode = state.distdyn;
                opts = { bits: state.distbits };
                ret = inftrees(DISTS$1, state.lens, state.nlen, state.ndist, state.distcode, 0, state.work, opts);
                state.distbits = opts.bits;
                if (ret) {
                    strm.msg = 'invalid distances set';
                    state.mode = BAD$1;
                    break;
                }
                state.mode = LEN_;
                if (flush === Z_TREES) {
                    break inf_leave;
                }
            case LEN_:
                state.mode = LEN;
            case LEN:
                if (have >= 6 && left >= 258) {
                    strm.next_out = put;
                    strm.avail_out = left;
                    strm.next_in = next;
                    strm.avail_in = have;
                    state.hold = hold;
                    state.bits = bits;
                    inffast(strm, _out);
                    put = strm.next_out;
                    output = strm.output;
                    left = strm.avail_out;
                    next = strm.next_in;
                    input = strm.input;
                    have = strm.avail_in;
                    hold = state.hold;
                    bits = state.bits;
                    if (state.mode === TYPE$1) {
                        state.back = -1;
                    }
                    break;
                }
                state.back = 0;
                for (;;) {
                    here = state.lencode[hold & (1 << state.lenbits) - 1];
                    here_bits = here >>> 24;
                    here_op = here >>> 16 & 255;
                    here_val = here & 65535;
                    if (here_bits <= bits) {
                        break;
                    }
                    if (have === 0) {
                        break inf_leave;
                    }
                    have--;
                    hold += input[next++] << bits;
                    bits += 8;
                }
                if (here_op && (here_op & 240) === 0) {
                    last_bits = here_bits;
                    last_op = here_op;
                    last_val = here_val;
                    for (;;) {
                        here = state.lencode[last_val + ((hold & (1 << last_bits + last_op) - 1) >> last_bits)];
                        here_bits = here >>> 24;
                        here_op = here >>> 16 & 255;
                        here_val = here & 65535;
                        if (last_bits + here_bits <= bits) {
                            break;
                        }
                        if (have === 0) {
                            break inf_leave;
                        }
                        have--;
                        hold += input[next++] << bits;
                        bits += 8;
                    }
                    hold >>>= last_bits;
                    bits -= last_bits;
                    state.back += last_bits;
                }
                hold >>>= here_bits;
                bits -= here_bits;
                state.back += here_bits;
                state.length = here_val;
                if (here_op === 0) {
                    state.mode = LIT;
                    break;
                }
                if (here_op & 32) {
                    state.back = -1;
                    state.mode = TYPE$1;
                    break;
                }
                if (here_op & 64) {
                    strm.msg = 'invalid literal/length code';
                    state.mode = BAD$1;
                    break;
                }
                state.extra = here_op & 15;
                state.mode = LENEXT;
            case LENEXT:
                if (state.extra) {
                    n = state.extra;
                    while (bits < n) {
                        if (have === 0) {
                            break inf_leave;
                        }
                        have--;
                        hold += input[next++] << bits;
                        bits += 8;
                    }
                    state.length += hold & (1 << state.extra) - 1;
                    hold >>>= state.extra;
                    bits -= state.extra;
                    state.back += state.extra;
                }
                state.was = state.length;
                state.mode = DIST;
            case DIST:
                for (;;) {
                    here = state.distcode[hold & (1 << state.distbits) - 1];
                    here_bits = here >>> 24;
                    here_op = here >>> 16 & 255;
                    here_val = here & 65535;
                    if (here_bits <= bits) {
                        break;
                    }
                    if (have === 0) {
                        break inf_leave;
                    }
                    have--;
                    hold += input[next++] << bits;
                    bits += 8;
                }
                if ((here_op & 240) === 0) {
                    last_bits = here_bits;
                    last_op = here_op;
                    last_val = here_val;
                    for (;;) {
                        here = state.distcode[last_val + ((hold & (1 << last_bits + last_op) - 1) >> last_bits)];
                        here_bits = here >>> 24;
                        here_op = here >>> 16 & 255;
                        here_val = here & 65535;
                        if (last_bits + here_bits <= bits) {
                            break;
                        }
                        if (have === 0) {
                            break inf_leave;
                        }
                        have--;
                        hold += input[next++] << bits;
                        bits += 8;
                    }
                    hold >>>= last_bits;
                    bits -= last_bits;
                    state.back += last_bits;
                }
                hold >>>= here_bits;
                bits -= here_bits;
                state.back += here_bits;
                if (here_op & 64) {
                    strm.msg = 'invalid distance code';
                    state.mode = BAD$1;
                    break;
                }
                state.offset = here_val;
                state.extra = here_op & 15;
                state.mode = DISTEXT;
            case DISTEXT:
                if (state.extra) {
                    n = state.extra;
                    while (bits < n) {
                        if (have === 0) {
                            break inf_leave;
                        }
                        have--;
                        hold += input[next++] << bits;
                        bits += 8;
                    }
                    state.offset += hold & (1 << state.extra) - 1;
                    hold >>>= state.extra;
                    bits -= state.extra;
                    state.back += state.extra;
                }
                if (state.offset > state.dmax) {
                    strm.msg = 'invalid distance too far back';
                    state.mode = BAD$1;
                    break;
                }
                state.mode = MATCH;
            case MATCH:
                if (left === 0) {
                    break inf_leave;
                }
                copy = _out - left;
                if (state.offset > copy) {
                    copy = state.offset - copy;
                    if (copy > state.whave) {
                        if (state.sane) {
                            strm.msg = 'invalid distance too far back';
                            state.mode = BAD$1;
                            break;
                        }
                    }
                    if (copy > state.wnext) {
                        copy -= state.wnext;
                        from = state.wsize - copy;
                    } else {
                        from = state.wnext - copy;
                    }
                    if (copy > state.length) {
                        copy = state.length;
                    }
                    from_source = state.window;
                } else {
                    from_source = output;
                    from = put - state.offset;
                    copy = state.length;
                }
                if (copy > left) {
                    copy = left;
                }
                left -= copy;
                state.length -= copy;
                do {
                    output[put++] = from_source[from++];
                } while (--copy);
                if (state.length === 0) {
                    state.mode = LEN;
                }
                break;
            case LIT:
                if (left === 0) {
                    break inf_leave;
                }
                output[put++] = state.length;
                left--;
                state.mode = LEN;
                break;
            case CHECK:
                if (state.wrap) {
                    while (bits < 32) {
                        if (have === 0) {
                            break inf_leave;
                        }
                        have--;
                        hold |= input[next++] << bits;
                        bits += 8;
                    }
                    _out -= left;
                    strm.total_out += _out;
                    state.total += _out;
                    if (_out) {
                        strm.adler = state.check = state.flags ? crc32_1(state.check, output, _out, put - _out) : adler32_1(state.check, output, _out, put - _out);
                    }
                    _out = left;
                    if ((state.flags ? hold : zswap32(hold)) !== state.check) {
                        strm.msg = 'incorrect data check';
                        state.mode = BAD$1;
                        break;
                    }
                    hold = 0;
                    bits = 0;
                }
                state.mode = LENGTH;
            case LENGTH:
                if (state.wrap && state.flags) {
                    while (bits < 32) {
                        if (have === 0) {
                            break inf_leave;
                        }
                        have--;
                        hold += input[next++] << bits;
                        bits += 8;
                    }
                    if (hold !== (state.total & 4294967295)) {
                        strm.msg = 'incorrect length check';
                        state.mode = BAD$1;
                        break;
                    }
                    hold = 0;
                    bits = 0;
                }
                state.mode = DONE;
            case DONE:
                ret = Z_STREAM_END;
                break inf_leave;
            case BAD$1:
                ret = Z_DATA_ERROR;
                break inf_leave;
            case MEM:
                return Z_MEM_ERROR;
            case SYNC:
            default:
                return Z_STREAM_ERROR;
            }
        }
    strm.next_out = put;
    strm.avail_out = left;
    strm.next_in = next;
    strm.avail_in = have;
    state.hold = hold;
    state.bits = bits;
    if (state.wsize || _out !== strm.avail_out && state.mode < BAD$1 && (state.mode < CHECK || flush !== Z_FINISH)) {
        if (updatewindow(strm, strm.output, strm.next_out, _out - strm.avail_out)) ;
    }
    _in -= strm.avail_in;
    _out -= strm.avail_out;
    strm.total_in += _in;
    strm.total_out += _out;
    state.total += _out;
    if (state.wrap && _out) {
        strm.adler = state.check = state.flags ? crc32_1(state.check, output, _out, strm.next_out - _out) : adler32_1(state.check, output, _out, strm.next_out - _out);
    }
    strm.data_type = state.bits + (state.last ? 64 : 0) + (state.mode === TYPE$1 ? 128 : 0) + (state.mode === LEN_ || state.mode === COPY_ ? 256 : 0);
    if ((_in === 0 && _out === 0 || flush === Z_FINISH) && ret === Z_OK) {
        ret = Z_BUF_ERROR;
    }
    return ret;
}
function inflateEnd(strm) {
    if (!strm || !strm.state) {
        return Z_STREAM_ERROR;
    }
    var state = strm.state;
    if (state.window) {
        state.window = null;
    }
    strm.state = null;
    return Z_OK;
}
function inflateGetHeader(strm, head) {
    var state;
    if (!strm || !strm.state) {
        return Z_STREAM_ERROR;
    }
    state = strm.state;
    if ((state.wrap & 2) === 0) {
        return Z_STREAM_ERROR;
    }
    state.head = head;
    head.done = false;
    return Z_OK;
}
function inflateSetDictionary(strm, dictionary) {
    var dictLength = dictionary.length;
    var state;
    var dictid;
    var ret;
    if (!strm || !strm.state) {
        return Z_STREAM_ERROR;
    }
    state = strm.state;
    if (state.wrap !== 0 && state.mode !== DICT) {
        return Z_STREAM_ERROR;
    }
    if (state.mode === DICT) {
        dictid = 1;
        dictid = adler32_1(dictid, dictionary, dictLength, 0);
        if (dictid !== state.check) {
            return Z_DATA_ERROR;
        }
    }
    ret = updatewindow(strm, dictionary, dictLength, dictLength);
    if (ret) {
        state.mode = MEM;
        return Z_MEM_ERROR;
    }
    state.havedict = 1;
    return Z_OK;
}
var inflateReset_1 = inflateReset;
var inflateReset2_1 = inflateReset2;
var inflateResetKeep_1 = inflateResetKeep;
var inflateInit_1 = inflateInit;
var inflateInit2_1 = inflateInit2;
var inflate_2 = inflate;
var inflateEnd_1 = inflateEnd;
var inflateGetHeader_1 = inflateGetHeader;
var inflateSetDictionary_1 = inflateSetDictionary;
var inflateInfo = 'pako inflate (from Nodeca project)';

var inflate_1 = {
	inflateReset: inflateReset_1,
	inflateReset2: inflateReset2_1,
	inflateResetKeep: inflateResetKeep_1,
	inflateInit: inflateInit_1,
	inflateInit2: inflateInit2_1,
	inflate: inflate_2,
	inflateEnd: inflateEnd_1,
	inflateGetHeader: inflateGetHeader_1,
	inflateSetDictionary: inflateSetDictionary_1,
	inflateInfo: inflateInfo
};

var STR_APPLY_OK = true;
var STR_APPLY_UIA_OK = true;
try {
    String.fromCharCode.apply(null, [0]);
} catch (__) {
    STR_APPLY_OK = false;
}
try {
    String.fromCharCode.apply(null, new Uint8Array(1));
} catch (__) {
    STR_APPLY_UIA_OK = false;
}
var _utf8len = new common.Buf8(256);
for (var q = 0; q < 256; q++) {
    _utf8len[q] = q >= 252 ? 6 : q >= 248 ? 5 : q >= 240 ? 4 : q >= 224 ? 3 : q >= 192 ? 2 : 1;
}
_utf8len[254] = _utf8len[254] = 1;
var string2buf = function (str) {
    var buf, c, c2, m_pos, i, str_len = str.length, buf_len = 0;
    for (m_pos = 0; m_pos < str_len; m_pos++) {
        c = str.charCodeAt(m_pos);
        if ((c & 64512) === 55296 && m_pos + 1 < str_len) {
            c2 = str.charCodeAt(m_pos + 1);
            if ((c2 & 64512) === 56320) {
                c = 65536 + (c - 55296 << 10) + (c2 - 56320);
                m_pos++;
            }
        }
        buf_len += c < 128 ? 1 : c < 2048 ? 2 : c < 65536 ? 3 : 4;
    }
    buf = new common.Buf8(buf_len);
    for (i = 0, m_pos = 0; i < buf_len; m_pos++) {
        c = str.charCodeAt(m_pos);
        if ((c & 64512) === 55296 && m_pos + 1 < str_len) {
            c2 = str.charCodeAt(m_pos + 1);
            if ((c2 & 64512) === 56320) {
                c = 65536 + (c - 55296 << 10) + (c2 - 56320);
                m_pos++;
            }
        }
        if (c < 128) {
            buf[i++] = c;
        } else if (c < 2048) {
            buf[i++] = 192 | c >>> 6;
            buf[i++] = 128 | c & 63;
        } else if (c < 65536) {
            buf[i++] = 224 | c >>> 12;
            buf[i++] = 128 | c >>> 6 & 63;
            buf[i++] = 128 | c & 63;
        } else {
            buf[i++] = 240 | c >>> 18;
            buf[i++] = 128 | c >>> 12 & 63;
            buf[i++] = 128 | c >>> 6 & 63;
            buf[i++] = 128 | c & 63;
        }
    }
    return buf;
};
function buf2binstring(buf, len) {
    if (len < 65537) {
        if (buf.subarray && STR_APPLY_UIA_OK || !buf.subarray && STR_APPLY_OK) {
            return String.fromCharCode.apply(null, common.shrinkBuf(buf, len));
        }
    }
    var result = '';
    for (var i = 0; i < len; i++) {
        result += String.fromCharCode(buf[i]);
    }
    return result;
}
var buf2binstring_1 = function (buf) {
    return buf2binstring(buf, buf.length);
};
var binstring2buf = function (str) {
    var buf = new common.Buf8(str.length);
    for (var i = 0, len = buf.length; i < len; i++) {
        buf[i] = str.charCodeAt(i);
    }
    return buf;
};
var buf2string = function (buf, max) {
    var i, out, c, c_len;
    var len = max || buf.length;
    var utf16buf = new Array(len * 2);
    for (out = 0, i = 0; i < len;) {
        c = buf[i++];
        if (c < 128) {
            utf16buf[out++] = c;
            continue;
        }
        c_len = _utf8len[c];
        if (c_len > 4) {
            utf16buf[out++] = 65533;
            i += c_len - 1;
            continue;
        }
        c &= c_len === 2 ? 31 : c_len === 3 ? 15 : 7;
        while (c_len > 1 && i < len) {
            c = c << 6 | buf[i++] & 63;
            c_len--;
        }
        if (c_len > 1) {
            utf16buf[out++] = 65533;
            continue;
        }
        if (c < 65536) {
            utf16buf[out++] = c;
        } else {
            c -= 65536;
            utf16buf[out++] = 55296 | c >> 10 & 1023;
            utf16buf[out++] = 56320 | c & 1023;
        }
    }
    return buf2binstring(utf16buf, out);
};
var utf8border = function (buf, max) {
    var pos;
    max = max || buf.length;
    if (max > buf.length) {
        max = buf.length;
    }
    pos = max - 1;
    while (pos >= 0 && (buf[pos] & 192) === 128) {
        pos--;
    }
    if (pos < 0) {
        return max;
    }
    if (pos === 0) {
        return max;
    }
    return pos + _utf8len[buf[pos]] > max ? pos : max;
};

var strings = {
	string2buf: string2buf,
	buf2binstring: buf2binstring_1,
	binstring2buf: binstring2buf,
	buf2string: buf2string,
	utf8border: utf8border
};

var constants = {
    Z_NO_FLUSH: 0,
    Z_PARTIAL_FLUSH: 1,
    Z_SYNC_FLUSH: 2,
    Z_FULL_FLUSH: 3,
    Z_FINISH: 4,
    Z_BLOCK: 5,
    Z_TREES: 6,
    Z_OK: 0,
    Z_STREAM_END: 1,
    Z_NEED_DICT: 2,
    Z_ERRNO: -1,
    Z_STREAM_ERROR: -2,
    Z_DATA_ERROR: -3,
    Z_BUF_ERROR: -5,
    Z_NO_COMPRESSION: 0,
    Z_BEST_SPEED: 1,
    Z_BEST_COMPRESSION: 9,
    Z_DEFAULT_COMPRESSION: -1,
    Z_FILTERED: 1,
    Z_HUFFMAN_ONLY: 2,
    Z_RLE: 3,
    Z_FIXED: 4,
    Z_DEFAULT_STRATEGY: 0,
    Z_BINARY: 0,
    Z_TEXT: 1,
    Z_UNKNOWN: 2,
    Z_DEFLATED: 8
};

var messages = {
    2: 'need dictionary',
    1: 'stream end',
    0: '',
    '-1': 'file error',
    '-2': 'stream error',
    '-3': 'data error',
    '-4': 'insufficient memory',
    '-5': 'buffer error',
    '-6': 'incompatible version'
};

function ZStream() {
    this.input = null;
    this.next_in = 0;
    this.avail_in = 0;
    this.total_in = 0;
    this.output = null;
    this.next_out = 0;
    this.avail_out = 0;
    this.total_out = 0;
    this.msg = '';
    this.state = null;
    this.data_type = 2;
    this.adler = 0;
}
var zstream = ZStream;

function GZheader() {
    this.text = 0;
    this.time = 0;
    this.xflags = 0;
    this.os = 0;
    this.extra = null;
    this.extra_len = 0;
    this.name = '';
    this.comment = '';
    this.hcrc = 0;
    this.done = false;
}
var gzheader = GZheader;

var toString = Object.prototype.toString;
function Inflate(options) {
    if (!(this instanceof Inflate))
        { return new Inflate(options); }
    this.options = common.assign({
        chunkSize: 16384,
        windowBits: 0,
        to: ''
    }, options || {});
    var opt = this.options;
    if (opt.raw && opt.windowBits >= 0 && opt.windowBits < 16) {
        opt.windowBits = -opt.windowBits;
        if (opt.windowBits === 0) {
            opt.windowBits = -15;
        }
    }
    if (opt.windowBits >= 0 && opt.windowBits < 16 && !(options && options.windowBits)) {
        opt.windowBits += 32;
    }
    if (opt.windowBits > 15 && opt.windowBits < 48) {
        if ((opt.windowBits & 15) === 0) {
            opt.windowBits |= 15;
        }
    }
    this.err = 0;
    this.msg = '';
    this.ended = false;
    this.chunks = [];
    this.strm = new zstream();
    this.strm.avail_out = 0;
    var status = inflate_1.inflateInit2(this.strm, opt.windowBits);
    if (status !== constants.Z_OK) {
        throw new Error(messages[status]);
    }
    this.header = new gzheader();
    inflate_1.inflateGetHeader(this.strm, this.header);
}
Inflate.prototype.push = function (data, mode) {
    var this$1 = this;

    var strm = this.strm;
    var chunkSize = this.options.chunkSize;
    var dictionary = this.options.dictionary;
    var status, _mode;
    var next_out_utf8, tail, utf8str;
    var dict;
    var allowBufError = false;
    if (this.ended) {
        return false;
    }
    _mode = mode === ~~mode ? mode : mode === true ? constants.Z_FINISH : constants.Z_NO_FLUSH;
    if (typeof data === 'string') {
        strm.input = strings.binstring2buf(data);
    } else if (toString.call(data) === '[object ArrayBuffer]') {
        strm.input = new Uint8Array(data);
    } else {
        strm.input = data;
    }
    strm.next_in = 0;
    strm.avail_in = strm.input.length;
    do {
        if (strm.avail_out === 0) {
            strm.output = new common.Buf8(chunkSize);
            strm.next_out = 0;
            strm.avail_out = chunkSize;
        }
        status = inflate_1.inflate(strm, constants.Z_NO_FLUSH);
        if (status === constants.Z_NEED_DICT && dictionary) {
            if (typeof dictionary === 'string') {
                dict = strings.string2buf(dictionary);
            } else if (toString.call(dictionary) === '[object ArrayBuffer]') {
                dict = new Uint8Array(dictionary);
            } else {
                dict = dictionary;
            }
            status = inflate_1.inflateSetDictionary(this$1.strm, dict);
        }
        if (status === constants.Z_BUF_ERROR && allowBufError === true) {
            status = constants.Z_OK;
            allowBufError = false;
        }
        if (status !== constants.Z_STREAM_END && status !== constants.Z_OK) {
            this$1.onEnd(status);
            this$1.ended = true;
            return false;
        }
        if (strm.next_out) {
            if (strm.avail_out === 0 || status === constants.Z_STREAM_END || strm.avail_in === 0 && (_mode === constants.Z_FINISH || _mode === constants.Z_SYNC_FLUSH)) {
                if (this$1.options.to === 'string') {
                    next_out_utf8 = strings.utf8border(strm.output, strm.next_out);
                    tail = strm.next_out - next_out_utf8;
                    utf8str = strings.buf2string(strm.output, next_out_utf8);
                    strm.next_out = tail;
                    strm.avail_out = chunkSize - tail;
                    if (tail) {
                        common.arraySet(strm.output, strm.output, next_out_utf8, tail, 0);
                    }
                    this$1.onData(utf8str);
                } else {
                    this$1.onData(common.shrinkBuf(strm.output, strm.next_out));
                }
            }
        }
        if (strm.avail_in === 0 && strm.avail_out === 0) {
            allowBufError = true;
        }
    } while ((strm.avail_in > 0 || strm.avail_out === 0) && status !== constants.Z_STREAM_END);
    if (status === constants.Z_STREAM_END) {
        _mode = constants.Z_FINISH;
    }
    if (_mode === constants.Z_FINISH) {
        status = inflate_1.inflateEnd(this.strm);
        this.onEnd(status);
        this.ended = true;
        return status === constants.Z_OK;
    }
    if (_mode === constants.Z_SYNC_FLUSH) {
        this.onEnd(constants.Z_OK);
        strm.avail_out = 0;
        return true;
    }
    return true;
};
Inflate.prototype.onData = function (chunk) {
    this.chunks.push(chunk);
};
Inflate.prototype.onEnd = function (status) {
    if (status === constants.Z_OK) {
        if (this.options.to === 'string') {
            this.result = this.chunks.join('');
        } else {
            this.result = common.flattenChunks(this.chunks);
        }
    }
    this.chunks = [];
    this.err = status;
    this.msg = this.strm.msg;
};
function inflate$1(input, options) {
    var inflator = new Inflate(options);
    inflator.push(input, true);
    if (inflator.err) {
        throw inflator.msg || messages[inflator.err];
    }
    return inflator.result;
}
function inflateRaw(input, options) {
    options = options || {};
    options.raw = true;
    return inflate$1(input, options);
}
var Inflate_1 = Inflate;
var inflate_2$1 = inflate$1;
var inflateRaw_1 = inflateRaw;
var ungzip = inflate$1;

var inflate_1$1 = {
	Inflate: Inflate_1,
	inflate: inflate_2$1,
	inflateRaw: inflateRaw_1,
	ungzip: ungzip
};

var byteLength_1 = byteLength;
var toByteArray_1 = toByteArray;
var fromByteArray_1 = fromByteArray;
var lookup = [];
var revLookup = [];
var Arr = typeof Uint8Array !== 'undefined' ? Uint8Array : Array;
var code = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
for (var i = 0, len = code.length; i < len; ++i) {
    lookup[i] = code[i];
    revLookup[code.charCodeAt(i)] = i;
}
revLookup['-'.charCodeAt(0)] = 62;
revLookup['_'.charCodeAt(0)] = 63;
function getLens(b64) {
    var len = b64.length;
    if (len % 4 > 0) {
        throw new Error('Invalid string. Length must be a multiple of 4');
    }
    var validLen = b64.indexOf('=');
    if (validLen === -1)
        { validLen = len; }
    var placeHoldersLen = validLen === len ? 0 : 4 - validLen % 4;
    return [
        validLen,
        placeHoldersLen
    ];
}
function byteLength(b64) {
    var lens = getLens(b64);
    var validLen = lens[0];
    var placeHoldersLen = lens[1];
    return (validLen + placeHoldersLen) * 3 / 4 - placeHoldersLen;
}
function _byteLength(b64, validLen, placeHoldersLen) {
    return (validLen + placeHoldersLen) * 3 / 4 - placeHoldersLen;
}
function toByteArray(b64) {
    var tmp;
    var lens = getLens(b64);
    var validLen = lens[0];
    var placeHoldersLen = lens[1];
    var arr = new Arr(_byteLength(b64, validLen, placeHoldersLen));
    var curByte = 0;
    var len = placeHoldersLen > 0 ? validLen - 4 : validLen;
    for (var i = 0; i < len; i += 4) {
        tmp = revLookup[b64.charCodeAt(i)] << 18 | revLookup[b64.charCodeAt(i + 1)] << 12 | revLookup[b64.charCodeAt(i + 2)] << 6 | revLookup[b64.charCodeAt(i + 3)];
        arr[curByte++] = tmp >> 16 & 255;
        arr[curByte++] = tmp >> 8 & 255;
        arr[curByte++] = tmp & 255;
    }
    if (placeHoldersLen === 2) {
        tmp = revLookup[b64.charCodeAt(i)] << 2 | revLookup[b64.charCodeAt(i + 1)] >> 4;
        arr[curByte++] = tmp & 255;
    }
    if (placeHoldersLen === 1) {
        tmp = revLookup[b64.charCodeAt(i)] << 10 | revLookup[b64.charCodeAt(i + 1)] << 4 | revLookup[b64.charCodeAt(i + 2)] >> 2;
        arr[curByte++] = tmp >> 8 & 255;
        arr[curByte++] = tmp & 255;
    }
    return arr;
}
function tripletToBase64(num) {
    return lookup[num >> 18 & 63] + lookup[num >> 12 & 63] + lookup[num >> 6 & 63] + lookup[num & 63];
}
function encodeChunk(uint8, start, end) {
    var tmp;
    var output = [];
    for (var i = start; i < end; i += 3) {
        tmp = (uint8[i] << 16 & 16711680) + (uint8[i + 1] << 8 & 65280) + (uint8[i + 2] & 255);
        output.push(tripletToBase64(tmp));
    }
    return output.join('');
}
function fromByteArray(uint8) {
    var tmp;
    var len = uint8.length;
    var extraBytes = len % 3;
    var parts = [];
    var maxChunkLength = 16383;
    for (var i = 0, len2 = len - extraBytes; i < len2; i += maxChunkLength) {
        parts.push(encodeChunk(uint8, i, i + maxChunkLength > len2 ? len2 : i + maxChunkLength));
    }
    if (extraBytes === 1) {
        tmp = uint8[len - 1];
        parts.push(lookup[tmp >> 2] + lookup[tmp << 4 & 63] + '==');
    } else if (extraBytes === 2) {
        tmp = (uint8[len - 2] << 8) + uint8[len - 1];
        parts.push(lookup[tmp >> 10] + lookup[tmp >> 4 & 63] + lookup[tmp << 2 & 63] + '=');
    }
    return parts.join('');
}

var base64Js = {
	byteLength: byteLength_1,
	toByteArray: toByteArray_1,
	fromByteArray: fromByteArray_1
};

var MBTilesSource = (function (VectorTileSource$$1) {
    function MBTilesSource(id, options, dispatcher, eventedParent) {
        VectorTileSource$$1.call(this, id, options, dispatcher, eventedParent);
        this.type = 'mbtiles';
        this.db = this.openDatabase(options.path);
    }

    if ( VectorTileSource$$1 ) MBTilesSource.__proto__ = VectorTileSource$$1;
    MBTilesSource.prototype = Object.create( VectorTileSource$$1 && VectorTileSource$$1.prototype );
    MBTilesSource.prototype.constructor = MBTilesSource;
    MBTilesSource.prototype.openDatabase = function openDatabase (dbLocation) {
        return __chunk_1.Database.openDatabase(dbLocation);
    };
    MBTilesSource.prototype.copyDatabaseFile = function copyDatabaseFile (dbLocation, dbName, targetDir) {
        return __chunk_1.Database.copyDatabaseFile(dbLocation, dbName, targetDir);
    };
    MBTilesSource.prototype.readTile = function readTile (z, x, y, callback) {
        var query = 'SELECT BASE64(tile_data) AS base64_tile_data FROM tiles WHERE zoom_level=? AND tile_column=? AND tile_row=?';
        var params = [
            z,
            x,
            y
        ];
        this.db.then(function (db) {
            db.transaction(function (txn) {
                txn.executeSql(query, params, function (tx, res) {
                    if (res.rows.length) {
                        var base64Data = res.rows.item(0).base64_tile_data;
                        if (!base64Data) {
                            callback(undefined, '');
                            return;
                        }
                        try {
                            var rawData = inflate_1$1.inflate(base64Js.toByteArray(base64Data));
                            callback(undefined, base64Js.fromByteArray(rawData));
                        } catch (err) {
                            callback(undefined, base64Data);
                        }
                    } else {
                        callback(new Error('tile ' + params.join(',') + ' not found'));
                    }
                });
            }, function (error) {
                callback(error);
            });
        }).catch(function (err) {
            callback(err);
        });
    };
    MBTilesSource.prototype.loadTile = function loadTile (tile, callback) {
        var coord = tile.tileID.canonical;
        var overscaling = coord.z > this.maxzoom ? Math.pow(2, coord.z - this.maxzoom) : 1;
        var z = Math.min(coord.z, this.maxzoom || coord.z);
        var x = coord.x;
        var y = Math.pow(2, z) - coord.y - 1;
        this.readTile(z, x, y, dispatch.bind(this));
        function dispatch(err, base64Data) {
            if (err) {
                if (this.url && window.allowMapboxOfflineMapOnlineTile) {
                    return VectorTileSource$$1.prototype.loadTile.call(this, tile, callback);
                } else {
                    return callback(err);
                }
            }
            if (base64Data === undefined) {
                return callback(new Error('empty data'));
            }
            var params = {
                request: { url: 'data:application/x-protobuf;base64,' + base64Data },
                uid: tile.uid,
                tileID: tile.tileID,
                zoom: coord.z,
                tileSize: this.tileSize * overscaling,
                type: this.type,
                source: this.id,
                pixelRatio: window.devicePixelRatio || 1,
                overscaling: overscaling,
                showCollisionBoxes: this.map.showCollisionBoxes
            };
            if (!tile.workerID || tile.state === 'expired') {
                tile.workerID = this.dispatcher.send('loadTile', params, done.bind(this));
            } else if (tile.state === 'loading') {
                tile.reloadCallback = callback;
            } else {
                this.dispatcher.send('reloadTile', params, done.bind(this), tile.workerID);
            }
            function done(err, data) {
                if (tile.aborted)
                    { return; }
                if (err) {
                    return callback(err);
                }
                if (this.map._refreshExpiredTiles)
                    { tile.setExpiryData(data); }
                tile.loadVectorData(data, this.map.painter);
                callback(null);
                if (tile.reloadCallback) {
                    this.loadTile(tile, tile.reloadCallback);
                    tile.reloadCallback = null;
                }
            }
        }
    };

    return MBTilesSource;
}(VectorTileSource));

var readJSON = function (url) { return new Promise(function (resolve, reject) {
    var xhr = new window.XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.onerror = function (e) { return reject(e); };
    xhr.onload = function () {
        var isFile = xhr.responseURL.indexOf('file://') === 0;
        if ((xhr.status >= 200 && xhr.status < 300 || isFile) && xhr.response) {
            try {
                resolve(JSON.parse(xhr.response));
            } catch (err) {
                reject(err);
            }
        } else {
            reject(new Error(xhr.statusText, xhr.status));
        }
    };
    xhr.send();
    return xhr;
}); };
var originalFetch = window.fetch;
function newFetch(resource, init) {
    if (typeof resource.url == 'string' && resource.url.match(/^file:/)) {
        return readJSON(resource.url).then(function (data) {
            return {
                ok: true,
                json: function () { return Promise.resolve(data); },
                headers: { get: function () { return ''; } }
            };
        });
    }
    return originalFetch(resource, init);
}
window.fetch = newFetch;
var dereferenceStyle = function (options) {
    if (typeof options.style === 'string' || options.style instanceof String) {
        return readJSON(options.style).then(function (style) { return util.extend({}, options, { style: style }); });
    } else {
        return Promise.resolve(options);
    }
};
var absoluteSpriteUrl = function (options) {
    var style = options.style;
    var hasProtocol = /^.+:\/\//;
    var path = window.location.origin + window.location.pathname.split('/').slice(0, -1).join('/');
    if ('sprite' in style && !style.sprite.match(hasProtocol) && 'glyphs' in style && !style.glyphs.match(hasProtocol)) {
        style.sprite = path + '/' + style.sprite;
        style.glyphs = path + '/' + style.glyphs;
    }
    return options;
};
var createEmptyMap = function (options) { return new Promise(function (resolve) {
    var emptyMapStyle = util.extend({}, options.style, {
        sources: {},
        layers: []
    });
    var emptyMapOptions = util.extend({}, options, { style: emptyMapStyle });
    var map = new Map(emptyMapOptions);
    map.once('load', function () {
        var mbTilesSourceLoaded = new Promise(function (resolve) {
            map.addSourceType('mbtiles', MBTilesSource, function () { return resolve(); });
        });
        var rasterOfflineSourceLoaded = new Promise(function (resolve) {
            map.addSourceType('rasteroffline', __chunk_1.RasterTileSourceOffline, function () { return resolve(); });
        });
        var rasterDEMOfflineSourceLoaded = new Promise(function (resolve) {
            map.addSourceType('raster-dem-offline', __chunk_1.RasterDEMTileSourceOffline, function () { return resolve(); });
        });
        Promise.all([
            mbTilesSourceLoaded,
            rasterOfflineSourceLoaded,
            rasterDEMOfflineSourceLoaded
        ]).then(function () { return resolve(map); });
    });
}); };
var loadSources = function (style) { return function (map) {
    Object.keys(style.sources).map(function (sourceName) { return map.addSource(sourceName, style.sources[sourceName]); });
    return map;
}; };
var loadLayers = function (style) { return function (map) {
    style.layers.map(function (layer) { return map.addLayer(layer); });
    return map;
}; };
var OfflineMap = function (options) { return dereferenceStyle(options).then(absoluteSpriteUrl).then(function (newOptions) { return createEmptyMap(newOptions).then(loadSources(newOptions.style)).then(loadLayers(newOptions.style)); }); };

var language = function () {
    var langFallbackDecorate = function (style, cfg) {
        var layers = style.layers;
        var lf = cfg['layer-filter'];
        var decorators = cfg['decorators'];
        var lfProp = lf[1];
        var lfValues = lf.slice(2);
        for (var i = layers.length - 1; i >= 0; i--) {
            var layer = layers[i];
            if (!(lf[0] === 'in' && lfProp === 'layout.text-field' && layer.layout && layer.layout['text-field'] && lfValues.indexOf(layer.layout['text-field']) >= 0)) {
                continue;
            }
            for (var j = decorators.length - 1; j >= 0; j--) {
                var decorator = decorators[j];
                var postfix = decorator['layer-name-postfix'] || '';
                postfix = postfix.replace(/(^-+|-+$)/g, '');
                if (j > 0) {
                    var newLayer = JSON.parse(JSON.stringify(layer));
                    layers.splice(i + 1, 0, newLayer);
                } else {
                    newLayer = layer;
                }
                newLayer.id += postfix ? '-' + postfix : '';
                newLayer.layout['text-field'] = decorator['layout.text-field'];
                if (newLayer.layout['symbol-placement'] === 'line') {
                    newLayer.layout['text-field'] = newLayer.layout['text-field'].replace('\n', ' ');
                }
                var filterPart = decorator['filter-all-part'].concat();
                if (!newLayer.filter) {
                    newLayer.filter = filterPart;
                } else if (newLayer.filter[0] == 'all') {
                    newLayer.filter.push(filterPart);
                } else {
                    newLayer.filter = [
                        'all',
                        newLayer.filter,
                        filterPart
                    ];
                }
            }
        }
    };
    var setStyleMutex = false;
    var origSetStyle = Map.prototype.setStyle;
    Map.prototype.setStyle = function () {
        origSetStyle.apply(this, arguments);
        if (!setStyleMutex) {
            if (this.styleUndecorated) {
                this.styleUndecorated = undefined;
            }
            this.once('styledata', function () {
                if (this.languageOptions) {
                    this.setLanguage(this.languageOptions.language, this.languageOptions.noAlt);
                }
            }.bind(this));
        }
    };
    Map.prototype.setLanguage = function (language, noAlt) {
        this.languageOptions = {
            language: language,
            noAlt: noAlt
        };
        if (!this.styleUndecorated) {
            try {
                this.styleUndecorated = this.getStyle();
            } catch (e) {
            }
        }
        if (!this.styleUndecorated) {
            return;
        }
        var isNonlatin = [
            'ar',
            'hy',
            'be',
            'bg',
            'zh',
            'ka',
            'el',
            'he',
            'ja',
            'ja_kana',
            'kn',
            'kk',
            'ko',
            'mk',
            'ru',
            'sr',
            'th',
            'uk'
        ].indexOf(language) >= 0;
        var style = JSON.parse(JSON.stringify(this.styleUndecorated));
        var langCfg = {
            'layer-filter': [
                'in',
                'layout.text-field',
                '{name}',
                '{name_de}',
                '{name_en}',
                '{name:latin}',
                '{name:latin} {name:nonlatin}',
                '{name:latin}\n{name:nonlatin}'
            ],
            'decorators': [
                {
                    'layout.text-field': '{name:latin}' + (noAlt ? '' : '\n{name:nonlatin}'),
                    'filter-all-part': [
                        '!has',
                        'name:' + language
                    ]
                },
                {
                    'layer-name-postfix': language,
                    'layout.text-field': '{name:' + language + '}' + (noAlt ? '' : '\n{name:' + (isNonlatin ? 'latin' : 'nonlatin') + '}'),
                    'filter-all-part': [
                        'has',
                        'name:' + language
                    ]
                }
            ]
        };
        if (language == 'native') {
            langCfg['decorators'] = [{
                    'layout.text-field': '{name}',
                    'filter-all-part': ['all']
                }];
        }
        langFallbackDecorate(style, langCfg);
        setStyleMutex = true;
        this.setStyle(style);
        setStyleMutex = false;
    };
    Map.prototype.autodetectLanguage = function (opt_fallback) {
        this.setLanguage(navigator.language.split('-')[0] || opt_fallback || 'native');
    };
};

mapboxgl.Database = __chunk_1.Database;
mapboxgl.OfflineMap = OfflineMap;
language(mapboxgl);

return mapboxgl;

});

//

return mapboxgl;

})));
//# sourceMappingURL=mapbox-gl-cordova-offline-unminified.js.map
