# This is a bash script to create cluster tiles using tippecanoe and upload to s3.
# Runs from Amazon Linux (ruby and unzip already installed)

# assumes named bucket has already been created

# install tippecanoe for creating tiles
brew install tippecanoe
brew upgrade tippecanoe

# install the npm shapefile package
npm install -g shapefile
npm install -g mapshaper

# array of unique state and territory fips codes
declare -a state_fips=('01' '02' '04' '05' '06' '08' '09' '10' '11' '12' '13' '15' '16' '17' '18' '19' '20' '21' '22' '23' '24' '25' '26' '27' '28' '29' '30' '31' '32' '33' '34' '35' '36' '37' '38' '39' '40' '41' '42' '44' '45' '46' '47' '48' '49' '50' '51' '53' '54' '55' '56' '60' '66' '69' '72' '78');

# clean old (just in case) and create temporary directories
rm -rf ./downloads ./geojson ./tiles ./unzipped ./simple ./combined ./cl_processed ./cl_dissolved ./cl_tiled
mkdir ./downloads ./geojson ./tiles ./unzipped ./simple ./combined ./cl_processed ./cl_dissolved ./cl_tiled

numberargs=$#

if [ $numberargs -lt 3 ] || [ $numberargs -gt 3 ] ; then 
    echo "incorrect.  use format: bash geotiles_carto_2014-2016.sh bucketname geolayer year"
    echo "where geolayer is one of: county, state, tract, bg, place"
    echo "where year is one of: 2014 2015 2016.  perhaps beyond."
    exit 1;
fi

bucket=$1
geolayer=$2
year=$3

echo "Creating "$geolayer"_"$year" tileset."

if [ "$geolayer" == "county" ] || [ "$geolayer" == "state" ] ;
then
    # download county or state shapefile and convert to geojson
    wget -P ./downloads/ https://www2.census.gov/geo/tiger/GENZ"$year"/shp/cb_"$year"_us_"$geolayer"_500k.zip
    unzip ./downloads/cb_"$year"_us_"$geolayer"_500k.zip -d ./unzipped
    shp2json ./unzipped/cb_"$year"_us_"$geolayer"_500k.shp > ./geojson/cb_"$year"_us_"$geolayer"_500k.geojson
fi

if [ "$geolayer" == "place" ] || [ "$geolayer" == "tract" ] || [ "$geolayer" == "bg" ] ;
then
    # download place, tract, or bg shapefile and convert to geojson
    for state in "${state_fips[@]}"
    do
        wget -P ./downloads/ https://www2.census.gov/geo/tiger/GENZ"$year"/shp/cb_"$year"_"$state"_"$geolayer"_500k.zip
        unzip ./downloads/cb_"$year"_"$state"_"$geolayer"_500k.zip -d ./unzipped
        shp2json ./unzipped/cb_"$year"_"$state"_"$geolayer"_500k.shp > ./geojson/cb_"$year"_"$state"_"$geolayer"_500k.geojson
    done
fi

    # create cluster metadata file
    node --max_old_space_size=8192 create_clusters.js $bucket
    
    # use mapshaper to make a drastically simplified version of the geojson
    for file in ./geojson/*.geojson
    do
        name=${file##*/}
        base=${name%.txt}
        mapshaper $file -simplify 10% -o ./simple/$name
    done
    
    # combine all geojson files into one
    mapshaper -i ./simple/*.geojson combine-files -merge-layers -o ./combined/cb_"$year"_"$geolayer"_cl.geojson
    
    # convert geoids to cluster numbers in geojson
    node --max_old_space_size=8192 create_cluster_geojson.js $bucket
    
    # dissolve on the cluster number
    mapshaper -i ./cl_processed/*.geojson -dissolve c -o ./cl_dissolved/cb_"$year"_"$geolayer"_cl.geojson
    
    # tippecanoe the cluster_geojson
    tippecanoe -e ./tiles/"$geolayer"_"$year"_cl -l main -aL -D8 -z9 -Z3 ./cl_dissolved/*.geojson
    
    # save the cluster tiles to the bucket
    aws s3 sync ./tiles/"$geolayer"_"$year"_cl s3://"$bucket"/"$geolayer"_"$year"_cl --content-encoding gzip --delete 
    
# clean up
rm -rf ./downloads ./geojson ./tiles ./unzipped ./simple ./combined ./cl_processed ./cl_dissolved ./cl_tiled