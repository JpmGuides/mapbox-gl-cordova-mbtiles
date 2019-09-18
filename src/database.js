

class Database {

    // On android, this should call "this.cordova.getActivity().getDatabasePath()",
    // but no API is exposed. So this is a hack.
    static getDatabaseDir() {
        if (!('sqlitePlugin' in self)) {
            return Promise.reject(new Error(
              "cordova-sqlite-ext plugin not available. " +
              "Please install the plugin and make sure this code is run after onDeviceReady event"));
        }
        if (!('device' in self)) {
            return Promise.reject(new Error(
              "cordova-plugin-device not available. " +
              "Please install the plugin and make sure this code is run after onDeviceReady event"));
        }
        return new Promise(function (resolve, reject) {
            if(device.platform === 'Android') {
                resolveLocalFileSystemURL(cordova.file.applicationStorageDirectory, function (dir) {
                    dir.getDirectory('databases', {create: true}, function (subdir) {
                        resolve(subdir);
                    });
                }, reject);
            } else if(device.platform === 'iOS') {
                resolveLocalFileSystemURL(cordova.file.documentsDirectory, resolve, reject);
            } else {
                reject("Platform not supported");
            }
        });
    }

    static openDatabase(dbLocation) {
        const dbName = dbLocation.split("/").slice(-1)[0]; // Get the DB file basename
        const source = this;
        return this.getDatabaseDir().then(function (targetDir) {
            return new Promise(function (resolve, reject) {
                targetDir.getFile(dbName, {}, resolve, reject);
            }).catch(function () {
                return source.copyDatabaseFile(dbLocation, dbName, targetDir)
            });
        }).then(function () {
            var params = {name: dbName};
            if(device.platform === 'iOS') {
                params.iosDatabaseLocation = 'Documents';
            } else {
                params.location = 'default';
            }
            return sqlitePlugin.openDatabase(params);
        });
    }

    static copyDatabaseFile(dbLocation, dbName, targetDir) {
        console.log("Copying database to application storage directory");
        return new Promise(function (resolve, reject) {
            const absPath =  cordova.file.applicationDirectory + 'www/' + dbLocation;
            resolveLocalFileSystemURL(absPath, resolve, reject);
        }).then(function (sourceFile) {
            return new Promise(function (resolve, reject) {
                sourceFile.copyTo(targetDir, dbName, resolve, reject);
            }).then(function () {
                console.log("Database copied");
            });
        });
    }
}

export default Database
