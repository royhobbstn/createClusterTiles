const Promise = require('bluebird');
const fs = require('fs');
const AWS = require('aws-sdk');
const rp = require('request-promise');

const CLUSTER = 'c2000';

const BUCKET = process.argv[2];

if(!BUCKET) {
  console.log('missing BUCKET argument.');
  console.log('please run like: node --max_old_space_size=8192 create_cluster_geojson.js $bucket');
  process.exit();
}

console.log('Using bucket: ' + process.argv[2]);


// read file in the ./combined directory to get year and geo

fs.readdir('./combined', (err, filenames) => {
    if (err) {
        console.log(err);
        process.exit();
    }

    const YEAR = filenames[0].split('_')[1];
    const GEO = filenames[0].split('_')[2];

    // process files one at a time
    Promise.all([readGeoJSON(filenames[0]), readClusterFile(YEAR, GEO)])
        .then(data => {

            const geojson = data[0];
            const cluster_lookup = data[1];

            // add cluster information and remove other properties
            const updated_features = geojson.features.map(feature => {
                const geoid = feature.properties.GEOID;
                const cluster = cluster_lookup[geoid];
                const properties = { properties: { c: cluster } };
                return Object.assign({}, feature, properties);
            }).filter(feature => {
                // filter out null geography
                return feature.geometry;
            });

            // save feature collection
            const clustered_geojson = { "type": "FeatureCollection", "features": updated_features };

            fs.writeFile(`./cl_processed/${filenames[0]}`, JSON.stringify(clustered_geojson), 'utf8', function(err) {

                if (err) {
                    return console.log(err);
                }
                console.log(`saved at ./cl_processed/${filenames[0]}`);
            });

            // let mapshaper handle dissolve (turfjs dissolve is buggy)

        })
        .catch(err => {
            console.log(err);
        });

});


// read combined GeoJSON file
function readGeoJSON(filename) {

    return new Promise((resolve, reject) => {
        console.log(`reading ${filename}`);
        fs.readFile(`./combined/${filename}`, 'utf-8', function(err, data) {
            if (err) {
                console.log(err);
                reject(err);
            }
            const collection = JSON.parse(data);

            console.log(`${filename} had ${collection.features.length} features.`);
            resolve(collection);
        });
    });
}


// read a cluster file
function readClusterFile(year, geo) {

    return rp({
            method: 'get',
            uri: `https://s3-us-west-2.amazonaws.com/${BUCKET}/clusters_${year}_${geo}.json`,
            headers: {
                'Accept-Encoding': 'gzip',
            },
            gzip: true,
            json: true,
            fullResponse: false
        })
        .then(data => {
            console.log(`found ${Object.keys(data[CLUSTER]).length} keys in cluster file!`);
            return data[CLUSTER];
        });

}
