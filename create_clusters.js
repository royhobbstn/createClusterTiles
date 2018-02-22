const turf = require('@turf/turf');
const Promise = require('bluebird');
const fs = require('fs');
const zlib = require('zlib');
const AWS = require('aws-sdk');
const s3 = new AWS.S3();
const clustersKmeans = require('./modules/modKMeans.js');

const BUCKET = process.argv[2];

if(!BUCKET) {
  console.log('missing BUCKET argument.');
  console.log('please run like: node --max_old_space_size=8192 create_clusters.js $bucket');
  process.exit();
}

console.log('Using bucket: ' + process.argv[2]);


fs.readdir('./geojson', (err, filenames) => {
    if (err) {
        console.log(err);
        process.exit();
    }

    // process files one at a time
    Promise.map(filenames, function(filename) {
            return extractFeatures(filename);
        }, { concurrency: 1 })
        .then(all_features => {
            console.log('all features gathered to single array');

            const feature_array = [].concat(...all_features);
            const count = feature_array.length;

            console.log(`counted ${count} features`);

            const point_array = feature_array.map(feature => {
                return turf.centroid(feature.geometry, feature.properties);
            });

            var point_layer = turf.featureCollection(point_array);

            // console.log('clustering @ 500');
            // const clustered_500 = clustersKmeans(point_layer, { numberOfClusters: parseInt(count / 500, 10) || 1 });

            console.log('clustering @ 2000');
            const clustered_2000 = clustersKmeans(point_layer, { numberOfClusters: parseInt(count / 2000, 10) || 1 });

            // console.log('clustering @ 5000');
            // const clustered_5000 = clustersKmeans(point_layer, { numberOfClusters: parseInt(count / 5000, 10) || 1 });

            // console.log('clustering @ 10000');
            // const clustered_10000 = clustersKmeans(point_layer, { numberOfClusters: parseInt(count / 10000, 10) || 1 });

            console.log('done clustering');

            const cluster_obj = {};

            // cluster_obj.c500 = {};
            cluster_obj.c2000 = {};
            // cluster_obj.c5000 = {};
            // cluster_obj.c10000 = {};

            // clustered_500.features.forEach(feature => {
            //     cluster_obj.c500[feature.properties.GEOID] = feature.properties.cluster;
            // });

            clustered_2000.features.forEach(feature => {
                cluster_obj.c2000[feature.properties.GEOID] = feature.properties.cluster;
            });

            // clustered_5000.features.forEach(feature => {
            //     cluster_obj.c5000[feature.properties.GEOID] = feature.properties.cluster;
            // });

            // clustered_10000.features.forEach(feature => {
            //     cluster_obj.c10000[feature.properties.GEOID] = feature.properties.cluster;
            // });

            // save output to s3
            const parsed_filename = filenames[0].split('_');
            const key = `clusters_${parsed_filename[1]}_${parsed_filename[3]}.json`;


            zlib.gzip(JSON.stringify(cluster_obj), function(error, result) {
                if (error) throw error;

                const params = { Bucket: BUCKET, Key: key, Body: result, ContentType: 'application/json', ContentEncoding: 'gzip' };
                s3.putObject(params, function(err, data) {
                    if (err) {
                        console.log(err);
                    }
                    else {
                        console.log(`Successfully uploaded data to ${key}`);
                    }
                });

            });

        });

});




function extractFeatures(filename) {
    return new Promise((resolve, reject) => {
        console.log(`reading ${filename}`);
        fs.readFile(`./geojson/${filename}`, 'utf-8', function(err, data) {
            if (err) {
                console.log(err);
                reject(err);
            }
            const features = JSON.parse(data).features;

            console.log(`${filename} had ${features.length} features.`);
            resolve(features);
        });
    });
}
