(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
'use strict';

(function() {
  function toArray(arr) {
    return Array.prototype.slice.call(arr);
  }

  function promisifyRequest(request) {
    return new Promise(function(resolve, reject) {
      request.onsuccess = function() {
        resolve(request.result);
      };

      request.onerror = function() {
        reject(request.error);
      };
    });
  }

  function promisifyRequestCall(obj, method, args) {
    var request;
    var p = new Promise(function(resolve, reject) {
      request = obj[method].apply(obj, args);
      promisifyRequest(request).then(resolve, reject);
    });

    p.request = request;
    return p;
  }

  function promisifyCursorRequestCall(obj, method, args) {
    var p = promisifyRequestCall(obj, method, args);
    return p.then(function(value) {
      if (!value) return;
      return new Cursor(value, p.request);
    });
  }

  function proxyProperties(ProxyClass, targetProp, properties) {
    properties.forEach(function(prop) {
      Object.defineProperty(ProxyClass.prototype, prop, {
        get: function() {
          return this[targetProp][prop];
        },
        set: function(val) {
          this[targetProp][prop] = val;
        }
      });
    });
  }

  function proxyRequestMethods(ProxyClass, targetProp, Constructor, properties) {
    properties.forEach(function(prop) {
      if (!(prop in Constructor.prototype)) return;
      ProxyClass.prototype[prop] = function() {
        return promisifyRequestCall(this[targetProp], prop, arguments);
      };
    });
  }

  function proxyMethods(ProxyClass, targetProp, Constructor, properties) {
    properties.forEach(function(prop) {
      if (!(prop in Constructor.prototype)) return;
      ProxyClass.prototype[prop] = function() {
        return this[targetProp][prop].apply(this[targetProp], arguments);
      };
    });
  }

  function proxyCursorRequestMethods(ProxyClass, targetProp, Constructor, properties) {
    properties.forEach(function(prop) {
      if (!(prop in Constructor.prototype)) return;
      ProxyClass.prototype[prop] = function() {
        return promisifyCursorRequestCall(this[targetProp], prop, arguments);
      };
    });
  }

  function Index(index) {
    this._index = index;
  }

  proxyProperties(Index, '_index', [
    'name',
    'keyPath',
    'multiEntry',
    'unique'
  ]);

  proxyRequestMethods(Index, '_index', IDBIndex, [
    'get',
    'getKey',
    'getAll',
    'getAllKeys',
    'count'
  ]);

  proxyCursorRequestMethods(Index, '_index', IDBIndex, [
    'openCursor',
    'openKeyCursor'
  ]);

  function Cursor(cursor, request) {
    this._cursor = cursor;
    this._request = request;
  }

  proxyProperties(Cursor, '_cursor', [
    'direction',
    'key',
    'primaryKey',
    'value'
  ]);

  proxyRequestMethods(Cursor, '_cursor', IDBCursor, [
    'update',
    'delete'
  ]);

  // proxy 'next' methods
  ['advance', 'continue', 'continuePrimaryKey'].forEach(function(methodName) {
    if (!(methodName in IDBCursor.prototype)) return;
    Cursor.prototype[methodName] = function() {
      var cursor = this;
      var args = arguments;
      return Promise.resolve().then(function() {
        cursor._cursor[methodName].apply(cursor._cursor, args);
        return promisifyRequest(cursor._request).then(function(value) {
          if (!value) return;
          return new Cursor(value, cursor._request);
        });
      });
    };
  });

  function ObjectStore(store) {
    this._store = store;
  }

  ObjectStore.prototype.createIndex = function() {
    return new Index(this._store.createIndex.apply(this._store, arguments));
  };

  ObjectStore.prototype.index = function() {
    return new Index(this._store.index.apply(this._store, arguments));
  };

  proxyProperties(ObjectStore, '_store', [
    'name',
    'keyPath',
    'indexNames',
    'autoIncrement'
  ]);

  proxyRequestMethods(ObjectStore, '_store', IDBObjectStore, [
    'put',
    'add',
    'delete',
    'clear',
    'get',
    'getAll',
    'getKey',
    'getAllKeys',
    'count'
  ]);

  proxyCursorRequestMethods(ObjectStore, '_store', IDBObjectStore, [
    'openCursor',
    'openKeyCursor'
  ]);

  proxyMethods(ObjectStore, '_store', IDBObjectStore, [
    'deleteIndex'
  ]);

  function Transaction(idbTransaction) {
    this._tx = idbTransaction;
    this.complete = new Promise(function(resolve, reject) {
      idbTransaction.oncomplete = function() {
        resolve();
      };
      idbTransaction.onerror = function() {
        reject(idbTransaction.error);
      };
      idbTransaction.onabort = function() {
        reject(idbTransaction.error);
      };
    });
  }

  Transaction.prototype.objectStore = function() {
    return new ObjectStore(this._tx.objectStore.apply(this._tx, arguments));
  };

  proxyProperties(Transaction, '_tx', [
    'objectStoreNames',
    'mode'
  ]);

  proxyMethods(Transaction, '_tx', IDBTransaction, [
    'abort'
  ]);

  function UpgradeDB(db, oldVersion, transaction) {
    this._db = db;
    this.oldVersion = oldVersion;
    this.transaction = new Transaction(transaction);
  }

  UpgradeDB.prototype.createObjectStore = function() {
    return new ObjectStore(this._db.createObjectStore.apply(this._db, arguments));
  };

  proxyProperties(UpgradeDB, '_db', [
    'name',
    'version',
    'objectStoreNames'
  ]);

  proxyMethods(UpgradeDB, '_db', IDBDatabase, [
    'deleteObjectStore',
    'close'
  ]);

  function DB(db) {
    this._db = db;
  }

  DB.prototype.transaction = function() {
    return new Transaction(this._db.transaction.apply(this._db, arguments));
  };

  proxyProperties(DB, '_db', [
    'name',
    'version',
    'objectStoreNames'
  ]);

  proxyMethods(DB, '_db', IDBDatabase, [
    'close'
  ]);

  // Add cursor iterators
  // TODO: remove this once browsers do the right thing with promises
  ['openCursor', 'openKeyCursor'].forEach(function(funcName) {
    [ObjectStore, Index].forEach(function(Constructor) {
      // Don't create iterateKeyCursor if openKeyCursor doesn't exist.
      if (!(funcName in Constructor.prototype)) return;

      Constructor.prototype[funcName.replace('open', 'iterate')] = function() {
        var args = toArray(arguments);
        var callback = args[args.length - 1];
        var nativeObject = this._store || this._index;
        var request = nativeObject[funcName].apply(nativeObject, args.slice(0, -1));
        request.onsuccess = function() {
          callback(request.result);
        };
      };
    });
  });

  // polyfill getAll
  [Index, ObjectStore].forEach(function(Constructor) {
    if (Constructor.prototype.getAll) return;
    Constructor.prototype.getAll = function(query, count) {
      var instance = this;
      var items = [];

      return new Promise(function(resolve) {
        instance.iterateCursor(query, function(cursor) {
          if (!cursor) {
            resolve(items);
            return;
          }
          items.push(cursor.value);

          if (count !== undefined && items.length == count) {
            resolve(items);
            return;
          }
          cursor.continue();
        });
      });
    };
  });

  var exp = {
    open: function(name, version, upgradeCallback) {
      var p = promisifyRequestCall(indexedDB, 'open', [name, version]);
      var request = p.request;

      if (request) {
        request.onupgradeneeded = function(event) {
          if (upgradeCallback) {
            upgradeCallback(new UpgradeDB(request.result, event.oldVersion, request.transaction));
          }
        };
      }

      return p.then(function(db) {
        return new DB(db);
      });
    },
    delete: function(name) {
      return promisifyRequestCall(indexedDB, 'deleteDatabase', [name]);
    }
  };

  if (typeof module !== 'undefined') {
    module.exports = exp;
    module.exports.default = module.exports;
  }
  else {
    self.idb = exp;
  }
}());

},{}],2:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _dbpromise = _interopRequireDefault(require("./dbpromise"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } }

function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); return Constructor; }

/**
 * Common database helper functions.
 */
var DBHelper =
/*#__PURE__*/
function () {
  function DBHelper() {
    _classCallCheck(this, DBHelper);
  }

  _createClass(DBHelper, null, [{
    key: "fetchRestaurants",

    /**
     * Fetch all restaurants.
     */
    value: function fetchRestaurants(callback) {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', "".concat(DBHelper.API_URL, "/restaurants"));

      xhr.onload = function () {
        if (xhr.status === 200) {
          // Got a success response from server!
          var restaurants = JSON.parse(xhr.responseText);

          _dbpromise.default.putRestaurants(restaurants);

          callback(null, restaurants);
        } else {
          // Oops!. Got an error from server.
          console.log("Request failed. Returned status of ".concat(xhr.status, ", trying idb...")); // if xhr request isn't code 200, try idb

          _dbpromise.default.getRestaurants().then(function (idbRestaurants) {
            // if we get back more than 1 restaurant from idb, return idbRestaurants
            if (idbRestaurants.length > 0) {
              callback(null, idbRestaurants);
            } else {
              // if we got back 0 restaurants return an error
              callback('No restaurants found in idb', null);
            }
          });
        }
      }; // XHR needs error handling for when server is down (doesn't respond or sends back codes)


      xhr.onerror = function () {
        console.log('Error while trying XHR, trying idb...'); // try idb, and if we get restaurants back, return them, otherwise return an error

        _dbpromise.default.getRestaurants().then(function (idbRestaurants) {
          if (idbRestaurants.length > 0) {
            callback(null, idbRestaurants);
          } else {
            callback('No restaurants found in idb', null);
          }
        });
      };

      xhr.send();
    }
    /**
     * Fetch a restaurant by its ID.
     */

  }, {
    key: "fetchRestaurantById",
    value: function fetchRestaurantById(id, callback) {
      fetch("".concat(DBHelper.API_URL, "/restaurants/").concat(id)).then(function (response) {
        if (!response.ok) return Promise.reject("Restaurant couldn't be fetched from network");
        return response.json();
      }).then(function (fetchedRestaurant) {
        // if restaurant could be fetched from network:
        _dbpromise.default.putRestaurants(fetchedRestaurant);

        return callback(null, fetchedRestaurant);
      }).catch(function (networkError) {
        // if restaurant couldn't be fetched from network:
        console.log("".concat(networkError, ", trying idb."));

        _dbpromise.default.getRestaurants(id).then(function (idbRestaurant) {
          if (!idbRestaurant) return callback("Restaurant not found in idb either", null);
          return callback(null, idbRestaurant);
        });
      });
    }
    /**
     * Fetch restaurants by a cuisine type with proper error handling.
     */

  }, {
    key: "fetchRestaurantByCuisine",
    value: function fetchRestaurantByCuisine(cuisine, callback) {
      // Fetch all restaurants  with proper error handling
      DBHelper.fetchRestaurants(function (error, restaurants) {
        if (error) {
          callback(error, null);
        } else {
          // Filter restaurants to have only given cuisine type
          var results = restaurants.filter(function (r) {
            return r.cuisine_type == cuisine;
          });
          callback(null, results);
        }
      });
    }
    /**
     * Fetch restaurants by a neighborhood with proper error handling.
     */

  }, {
    key: "fetchRestaurantByNeighborhood",
    value: function fetchRestaurantByNeighborhood(neighborhood, callback) {
      // Fetch all restaurants
      DBHelper.fetchRestaurants(function (error, restaurants) {
        if (error) {
          callback(error, null);
        } else {
          // Filter restaurants to have only given neighborhood
          var results = restaurants.filter(function (r) {
            return r.neighborhood == neighborhood;
          });
          callback(null, results);
        }
      });
    }
    /**
     * Fetch restaurants by a cuisine and a neighborhood with proper error handling.
     */

  }, {
    key: "fetchRestaurantByCuisineAndNeighborhood",
    value: function fetchRestaurantByCuisineAndNeighborhood(cuisine, neighborhood, callback) {
      // Fetch all restaurants
      DBHelper.fetchRestaurants(function (error, restaurants) {
        if (error) {
          callback(error, null);
        } else {
          var results = restaurants;

          if (cuisine != 'all') {
            // filter by cuisine
            results = results.filter(function (r) {
              return r.cuisine_type == cuisine;
            });
          }

          if (neighborhood != 'all') {
            // filter by neighborhood
            results = results.filter(function (r) {
              return r.neighborhood == neighborhood;
            });
          }

          callback(null, results);
        }
      });
    }
    /**
     * Fetch all neighborhoods with proper error handling.
     */

  }, {
    key: "fetchNeighborhoods",
    value: function fetchNeighborhoods(callback) {
      // Fetch all restaurants
      DBHelper.fetchRestaurants(function (error, restaurants) {
        if (error) {
          callback(error, null);
        } else {
          // Get all neighborhoods from all restaurants
          var neighborhoods = restaurants.map(function (v, i) {
            return restaurants[i].neighborhood;
          }); // Remove duplicates from neighborhoods

          var uniqueNeighborhoods = neighborhoods.filter(function (v, i) {
            return neighborhoods.indexOf(v) == i;
          });
          callback(null, uniqueNeighborhoods);
        }
      });
    }
    /**
     * Fetch all cuisines with proper error handling.
     */

  }, {
    key: "fetchCuisines",
    value: function fetchCuisines(callback) {
      // Fetch all restaurants
      DBHelper.fetchRestaurants(function (error, restaurants) {
        if (error) {
          callback(error, null);
        } else {
          // Get all cuisines from all restaurants
          var cuisines = restaurants.map(function (v, i) {
            return restaurants[i].cuisine_type;
          }); // Remove duplicates from cuisines

          var uniqueCuisines = cuisines.filter(function (v, i) {
            return cuisines.indexOf(v) == i;
          });
          callback(null, uniqueCuisines);
        }
      });
    }
    /**
     * Restaurant page URL.
     */

  }, {
    key: "urlForRestaurant",
    value: function urlForRestaurant(restaurant) {
      return "./restaurant.html?id=".concat(restaurant.id);
    }
    /**
       * Restaurant image URL. It defaults to a medium sized image. It uses restaurant.photograph
       * and fallbacks to restaurant.id if former is missing.
       */

  }, {
    key: "imageUrlForRestaurant",
    value: function imageUrlForRestaurant(restaurant) {
      var url = "/img/".concat(restaurant.photograph || restaurant.id, "-medium.jpg");
      return url;
    }
    /**
     * Restaurant srcset attribute for browser to decide best resolution. It uses restaurant.photograph
     * and fallbacks to restaurant.id if former is missing.
     */

  }, {
    key: "imageSrcsetForRestaurant",
    value: function imageSrcsetForRestaurant(restaurant) {
      var imageSrc = "/img/".concat(restaurant.photograph || restaurant.id);
      return "".concat(imageSrc, "-small.jpg 300w,\n            ").concat(imageSrc, "-medium.jpg 600w,\n            ").concat(imageSrc, "-large.jpg 800w");
    }
    /**
     * Restaurant sizes attribute so browser knows image sizes before deciding
     * what image to download.
     */

  }, {
    key: "imageSizesForRestaurant",
    value: function imageSizesForRestaurant(restaurant) {
      return "(max-width: 360px) 280px,\n            (max-width: 600px) 600px,\n            400px";
    }
    /**
     * Map marker for a restaurant.
     */

  }, {
    key: "mapMarkerForRestaurant",
    value: function mapMarkerForRestaurant(restaurant, map) {
      // https://leafletjs.com/reference-1.3.0.html#marker  
      var marker = new L.marker([restaurant.latlng.lat, restaurant.latlng.lng], {
        title: restaurant.name,
        alt: restaurant.name,
        url: DBHelper.urlForRestaurant(restaurant)
      });
      marker.addTo(map);
      return marker;
    }
    /* static mapMarkerForRestaurant(restaurant, map) {
      const marker = new google.maps.Marker({
        position: restaurant.latlng,
        title: restaurant.name,
        url: DBHelper.urlForRestaurant(restaurant),
        map: map,
        animation: google.maps.Animation.DROP}
      );
      return marker;
    } */

  }, {
    key: "mapOffline",
    value: function mapOffline() {
      var map = document.getElementById('map');
      map.className = "map-offline";
      map.innerHTML = "<div class=\"warning-icon\">!</div>\n    <div class=\"warning-message\">We're having problems loading Maps</div>\n    <div class=\"warning-suggestion\">Are you offline? If you need to see a map, please check back later.</div>";
    }
  }, {
    key: "API_URL",

    /**
     * API URL
     */
    get: function get() {
      var port = 1337; // port where sails server will listen

      return "http://localhost:".concat(port);
    }
    /**
     * Database URL.
     * Change this to restaurants.json file location on your server.
     */

  }, {
    key: "DATABASE_URL",
    get: function get() {
      var port = 1337; // Change this to your server port

      return "http://localhost:".concat(port, "/data/restaurants.json");
    }
  }]);

  return DBHelper;
}();

exports.default = DBHelper;

},{"./dbpromise":3}],3:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _idb = _interopRequireDefault(require("idb"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var dbPromise = {
  // creation and updating of database happens here.
  db: _idb.default.open('restaurant-reviews-db', 1, function (upgradeDb) {
    switch (upgradeDb.oldVersion) {
      case 0:
        upgradeDb.createObjectStore('restaurants', {
          keyPath: 'id'
        });
    }
  }),

  /**
   * Save a restaurant or array of restaurants into idb, using promises.
   */
  putRestaurants: function putRestaurants(restaurants) {
    if (!restaurants.push) restaurants = [restaurants];
    return this.db.then(function (db) {
      var store = db.transaction('restaurants', 'readwrite').objectStore('restaurants');
      Promise.all(restaurants.map(function (networkRestaurant) {
        return store.get(networkRestaurant.id).then(function (idbRestaurant) {
          if (!idbRestaurant || networkRestaurant.updatedAt > idbRestaurant.updatedAt) {
            return store.put(networkRestaurant);
          }
        });
      })).then(function () {
        return store.complete;
      });
    });
  },

  /**
   * Get a restaurant, by its id, or all stored restaurants in idb using promises.
   * If no argument is passed, all restaurants will returned.
   */
  getRestaurants: function getRestaurants() {
    var id = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : undefined;
    return this.db.then(function (db) {
      var store = db.transaction('restaurants').objectStore('restaurants');
      if (id) return store.get(Number(id));
      return store.getAll();
    });
  }
};
var _default = dbPromise;
exports.default = _default;

},{"idb":1}],4:[function(require,module,exports){
"use strict";

// if service worker is supported, register
if (navigator.serviceWorker) {
  navigator.serviceWorker.register('/sw.js').then(function (reg) {
    console.log("Service Worker has been registered successfully!");
  }).catch(function (e) {
    console.log("Couldn't register service worker... \n", e);
  });
}

},{}],5:[function(require,module,exports){
"use strict";

var _dbhelper = _interopRequireDefault(require("./dbhelper"));

var _secret = _interopRequireDefault(require("./secret"));

require("./register-sw");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var restaurant;
var newMap;
/**
 * Initialize map as soon as the page is loaded.
 */

document.addEventListener('DOMContentLoaded', function (event) {
  initMap();
});
/**
 * Initialize leaflet map
 */

var initMap = function initMap() {
  fetchRestaurantFromURL(function (error, restaurant) {
    if (error) {
      // Got an error!
      console.error(error);
    } else {
      if (navigator.onLine) {
        try {
          newMap = L.map('map', {
            center: [restaurant.latlng.lat, restaurant.latlng.lng],
            zoom: 16,
            scrollWheelZoom: false
          });
          L.tileLayer('https://api.tiles.mapbox.com/v4/{id}/{z}/{x}/{y}.jpg70?access_token={mapboxToken}', {
            mapboxToken: _secret.default.mapbox_key,
            maxZoom: 18,
            attribution: 'Map data &copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors, ' + '<a href="https://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, ' + 'Imagery © <a href="https://www.mapbox.com/">Mapbox</a>',
            id: 'mapbox.streets'
          }).addTo(newMap);

          _dbhelper.default.mapMarkerForRestaurant(self.restaurant, newMap);
        } catch (error) {
          console.log("Map couldn't be initialized", error); // If an error occurred while trying to initialize the map, set map as offline

          _dbhelper.default.mapOffline();
        }
      } else {
        //  If app detects we're offline, set map as offline
        _dbhelper.default.mapOffline();
      }

      fillBreadcrumb();
    }
  });
};
/* window.initMap = () => {
  fetchRestaurantFromURL((error, restaurant) => {
    if (error) { // Got an error!
      console.error(error);
    } else {
      self.map = new google.maps.Map(document.getElementById('map'), {
        zoom: 16,
        center: restaurant.latlng,
        scrollwheel: false
      });
      fillBreadcrumb();
      DBHelper.mapMarkerForRestaurant(self.restaurant, self.map);
    }
  });
} */

/**
 * Get current restaurant from page URL.
 */


var fetchRestaurantFromURL = function fetchRestaurantFromURL(callback) {
  if (self.restaurant) {
    // restaurant already fetched!
    callback(null, self.restaurant);
    return;
  }

  var id = getParameterByName('id');

  if (!id) {
    // no id found in URL
    error = 'No restaurant id in URL';
    callback(error, null);
  } else {
    _dbhelper.default.fetchRestaurantById(id, function (error, restaurant) {
      self.restaurant = restaurant;

      if (!restaurant) {
        console.error(error);
        return;
      }

      fillRestaurantHTML();
      callback(null, restaurant);
    });
  }
};
/**
 * Create restaurant HTML and add it to the webpage
 */


var fillRestaurantHTML = function fillRestaurantHTML() {
  var restaurant = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : self.restaurant;
  var name = document.getElementById('restaurant-name');
  name.innerHTML = restaurant.name;
  var address = document.getElementById('restaurant-address');
  address.innerHTML = restaurant.address;
  var image = document.getElementById('restaurant-img');
  image.className = 'restaurant-img';
  image.alt = "Picture of ".concat(restaurant.name);
  image.src = _dbhelper.default.imageUrlForRestaurant(restaurant);
  image.srcset = _dbhelper.default.imageSrcsetForRestaurant(restaurant);
  image.sizes = _dbhelper.default.imageSizesForRestaurant(restaurant);
  var cuisine = document.getElementById('restaurant-cuisine');
  cuisine.innerHTML = restaurant.cuisine_type; // fill operating hours

  if (restaurant.operating_hours) {
    fillRestaurantHoursHTML();
  } // fill reviews


  fillReviewsHTML();
};
/**
 * Create restaurant operating hours HTML table and add it to the webpage.
 */


var fillRestaurantHoursHTML = function fillRestaurantHoursHTML() {
  var operatingHours = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : self.restaurant.operating_hours;
  var hours = document.getElementById('restaurant-hours');

  for (var key in operatingHours) {
    var row = document.createElement('tr');
    var day = document.createElement('td');
    day.innerHTML = key;
    row.appendChild(day);
    var time = document.createElement('td');
    time.innerHTML = operatingHours[key];
    row.appendChild(time);
    hours.appendChild(row);
  }
};
/**
 * Create all reviews HTML and add them to the webpage.
 */


var fillReviewsHTML = function fillReviewsHTML() {
  var reviews = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : self.restaurant.reviews;
  var container = document.getElementById('reviews-container');
  var title = document.createElement('h2');
  title.innerHTML = 'Reviews';
  container.appendChild(title);

  if (!reviews) {
    var noReviews = document.createElement('p');
    noReviews.innerHTML = 'No reviews yet!';
    container.appendChild(noReviews);
    return;
  }

  var ul = document.getElementById('reviews-list');
  reviews.forEach(function (review) {
    ul.appendChild(createReviewHTML(review));
  });
  container.appendChild(ul);
};
/**
 * Create review HTML and add it to the webpage.
 */


var createReviewHTML = function createReviewHTML(review) {
  var li = document.createElement('li');
  var name = document.createElement('p');
  name.innerHTML = review.name;
  li.appendChild(name);
  var date = document.createElement('p');
  date.innerHTML = review.date;
  li.appendChild(date);
  var rating = document.createElement('p');
  rating.innerHTML = "Rating: ".concat(review.rating);
  li.appendChild(rating);
  var comments = document.createElement('p');
  comments.innerHTML = review.comments;
  li.appendChild(comments);
  return li;
};
/**
 * Add restaurant name to the breadcrumb navigation menu
 */


var fillBreadcrumb = function fillBreadcrumb() {
  var restaurant = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : self.restaurant;
  var breadcrumb = document.getElementById('breadcrumb');
  var li = document.createElement('li');
  li.innerHTML = restaurant.name;
  breadcrumb.appendChild(li);
};
/**
 * Get a parameter by name from page URL.
 */


var getParameterByName = function getParameterByName(name, url) {
  if (!url) url = window.location.href;
  name = name.replace(/[\[\]]/g, '\\$&');
  var regex = new RegExp("[?&]".concat(name, "(=([^&#]*)|&|#|$)")),
      results = regex.exec(url);
  if (!results) return null;
  if (!results[2]) return '';
  return decodeURIComponent(results[2].replace(/\+/g, ' '));
};

},{"./dbhelper":2,"./register-sw":4,"./secret":6}],6:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } }

function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); return Constructor; }

var SECRET =
/*#__PURE__*/
function () {
  function SECRET() {
    _classCallCheck(this, SECRET);
  }

  _createClass(SECRET, null, [{
    key: "mapbox_key",
    get: function get() {
      return "pk.eyJ1Ijoic3Ryb25nZGFuIiwiYSI6ImNqbmoxMWdocDBhbm0za216aTh6NmlicXkifQ.z07X8Wabx5lwk2Jtu_gnxw";
    }
  }]);

  return SECRET;
}();

exports.default = SECRET;

},{}]},{},[5])

//# sourceMappingURL=restaurant_info.js.map
