var q = require('q');
var https = require('https');
var cheerio = require('cheerio');
var fs = require('fs');
var url = require('url');

const MAX_PAGES = 10;
var hostname = 'unsplash.com';
var image_num = 1;
var page = 1;

function start() {
	getPageNum(page++)
	.then(function() {
		if (page <= MAX_PAGES) {
			start();
		}
	})
	.catch(function(err) {
		console.log(err);
		console.trace(err);
	});
}

function getPageNum(page) {
	return getPage(hostname, '/?page=' + page.toString())
	.then(function(data) {
		var $ = cheerio.load(data);
		var images = $('img[alt^="Photo By"]');
		if (images.length === 0) {
			console.log('Done!');
			return exit(1);
		}
	
		return q.all(images.map(function() {
			var image_url = url.parse($(this).attr('src'));
			return getPage(image_url.host, image_url.path);
		}));
	})
	.then(function(images) {
		return q.all(Object.keys(images).map(function(i) {
			var img = images[i];
			return q.nfcall(fs.writeFile, 'images/' + image_num++ + '.jpg', img); 
		}));
	})
	.then(function() {
		console.log('Page %d downloaded', page);
	});
}

function getPage(hostname, url) {
	console.log('getPage', hostname, url);
	return q.promise(function(resolve, reject) {
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
				resolve(buf);
			});

			res.on('error', function(e) {
				reject(e);
			});
		}).end();
	});
}

start();

