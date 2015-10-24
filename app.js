var q = require('q');
var https = require('https');
var cheerio = require('cheerio');
var fs = require('fs');
var url = require('url');
var glob = require('glob');
var colors = require('colors');

const VERSION = '0.0.1';

var opt = require('node-getopt').create([
		['', 'host', 'Custom host'],
		['s', 'start-page=PAGE', 'Page to start from. Defaults to 1'],
		['e', 'end-page=PAGE', 'Last page to get. Defaults to all'],
		['h', 'help', 'Display this help'],
		['v', 'version', 'Show version'],
		['c', 'clean', 'Delete all data from images-directory'],
])
.bindHelp()
.parseSystem();

var promise = q();

if (opt.options.version) {
	console.log('Version %s'.green, VERSION);
	process.exit(1);
}
else if (opt.options.clean) {
	console.log('Cleaning images-directory...'.yellow);
	promise = promise.then(cleanImages);
}

var hostname = opt.options.host || 'unsplash.com';
var page = parseInt(opt.options['start-page'], 10) || 1;
var end_page = parseInt(opt.options['end-page'], 10) || 999999;
var image_num = (page - 1) * 20;

function start() {
	return getPageNum(page++)
	.then(function() {
		if (page <= end_page) {
			return start();
		}
	});
}

function getPageNum(page) {
	console.log('Requesting page number %d'.green, page);
	return getPage(hostname, '/?page=' + page.toString())
	.then(function(res) {
		var $ = cheerio.load(res.data);
		var images = $('img[alt^="Photo By"]');
		if (images.length === 0) {
			return process.exit(1);
		}
	
		return q.all(images.map(function() {
			var image_url = url.parse($(this).attr('src'), true);
			return getPage(image_url.host, image_url.pathname);
		}));
	})
	.then(function(images) {
		console.log('Got response from %d images'.blue, images.length);
		return q.all(Object.keys(images).map(function(i) {
			var img = images[i];
			if (!img.name) {
				return q();
			}
			return q.nfcall(fs.writeFile, 'images/' + img.name.replace(/[^a-z_.\-0-9]+/ig, '') + '.jpg', img.data); 
		}));
	})
	.then(function() {
		console.log('Page %d downloaded'.green, page);
	});
}

function getPage(hostname, url) {
	console.log('Requesting https://%s'.green, hostname + url);
	return q.Promise(function(resolve, reject) {
		https.request({
			hostname: hostname,
			port: 443,
			path: url,
			agent: false,
			method: 'GET',
			rejectUnauthorized: false,
		}, function(res) {
			var buf = new Buffer(parseInt(res.headers['content-length'], 10) + 1);
			var pos = 0;

			res.on('data', function(d) {
				d.copy(buf, pos, 0);
				pos += d.length;
			});

			res.on('end', function() {
				resolve({data: buf, name: url.substr(1)});
			});

			res.on('error', function(e) {
				reject(e);
			});
		}).end();
	});
}

function cleanImages() {
	return q.nfcall(glob, 'images/*.jpg')
	.then(function(files) {
		return q.all(files.map(function(file) {
			console.log('\t...%s'.red, file);
			return q.nfcall(fs.unlink, file);
		}));
	});
}

promise
.then(start)
.then(function() {
	console.log('All done!'.green);
})
.catch(function(err) {
	console.log(err.red);
	console.trace(err);
});

