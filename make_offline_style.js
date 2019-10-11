const request = require('request');
const fs = require('fs');
const util = require('util');

const klokanApiKey = 'e7trAnc5053j8mX60MlQ';

const mkdir = util.promisify(fs.mkdir);

function styleUrl(style) {
  if (style.match(/^http/)) {
    return style;
  }
  return 'https://maps.tilehosting.com/styles/' + style + '/style.json?key=' + klokanApiKey;
}

function downloadJson(url) {
  return new Promise((resolve, reject) => {
    request(url, (error, response, body) => {
      if (error) {
        reject(error);
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(new Error('Failed to parse json from ' + url + ':' + err));
      }
    });
  });
}

function downloadToFile(url, file) {
  return new Promise((resolve, reject) => {
    request(url)
      .on('error', reject)
      .pipe(fs.createWriteStream(file))
      .on('finish', resolve);
  });
}

function makeJsonDataUrl(url) {
  return 'data:application/json,' + encodeURIComponent(JSON.stringify(url));
}

async function processStyle(styleNameOrUrl) {
  const url = styleUrl(styleNameOrUrl);

  console.log('downloading:', url);

  const style = await downloadJson(url);
  const styleName = style.name;

  console.log('Preparing ' + styleName + ' from ' + url);

  const folder = 'www/styles/' + styleName;
  try {
    await mkdir(folder);
  } catch(err) { }


  for (let s in style.sources) {
    const source = style.sources[s];
    console.log('s:', s, ' source:', source);
    if (source.type == 'vector' && s == 'openmaptiles') {
      // source.path = "assets/offlinemap/map.mbtiles";
      //source.path = "data/2017-07-03_spain_barcelona.mbtiles",
      source.path = 'map.mbtiles';
      source.type = "mbtiles";
      source.url = makeJsonDataUrl(await downloadJson(source.url));
    } else if (source.type == 'raster' && s == 'hillshading') {
      //source.path = "assets/offlinemap/hillshading.mbtiles";
      //source.path = "data/2016-11-28-hillshade-spain_barcelona.mbtiles",
      source.path = "hillshading.mbtiles";
      source.type = "rasteroffline";
      source.url = makeJsonDataUrl(await downloadJson(source.url));
    } else if (source.type == 'vector' && s == 'contours') {
      source.path = "contours.mbtiles";
      source.type = "mbtiles";
      source.url = makeJsonDataUrl(await downloadJson(source.url));
    } else if (source.type == 'vector' && s == 'landcover') {
      source.path = "landcover.mbtiles";
      source.type = "mbtiles";
      source.url = makeJsonDataUrl(await downloadJson(source.url));
    } else if (source.type == 'raster-dem' && s == 'terrain-rgb') {
      source.path = "terrain-rgb.mbtiles";
      source.type = "raster-dem-offline";
      source.url = makeJsonDataUrl(await downloadJson(source.url));
    } else {
      console.warn('WARNING: dont know how to handle source ' + s + ' of type ' + source.type);
    }

  }

  const spriteBaseUrl = style.sprite;
  style.sprite = "styles/" + styleName + "/sprite";

  await Promise.all([
    downloadToFile(spriteBaseUrl + '.png', folder + '/sprite.png'),
    downloadToFile(spriteBaseUrl + '.json', folder + '/sprite.json'),
    downloadToFile(spriteBaseUrl + '@2x.png', folder + '/sprite@2x.png'),
    downloadToFile(spriteBaseUrl + '@2x.json', folder + '/sprite@2x.json')
  ]);

  style.glyphs = "fonts/{fontstack}/{range}.pbf";

  const styleFile = folder + '/style.json';
  fs.writeFileSync(styleFile, JSON.stringify(style, null, 2));

  console.log('Wrote ' + styleFile);
}

async function main(argv) {
  for (let i = 2; i < argv.length; ++i) {
    try {
      await processStyle(argv[i]);
    }catch(err) {
      console.warn(err.message);
      console.warn(err.stack);
    }
  }
}

main(process.argv);
