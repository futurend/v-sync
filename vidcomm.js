var spawn = require('child_process').spawn,
    http = require('http'),
    urlmod = require('url'),
    fs = require('fs');
var vidProc,
    player,
    vidProcLog = '',
    files = [],
    currFile = 0;
var localAddress = '',
    remoteAddress = '',
    port = 3000,
    req,
    res;

// INIT ////////////////////////////////////

// standardized exit function
var exitFunction = function (code) {
    console.log('exiting vidcomm');
    if (code) console.log('exited with code '+code);
    if (vidProcLog.length) console.log(vidProcLog);
    // show cursor
    console.log('\033[?12l\033[?25h');
}

// HTTP SERVER /////////////////////////////

// find local ip address
var findLocalAddress = function () {
    require('child_process').exec('ifconfig eth0 | grep \'inet addr:\' | cut -d: -f2 | awk \'{ print $1}\'', function (error, stdout, stderr) {
        if (stdout.search(/192\.168\.1\.\d+/) !== -1) {
            localAddress = stdout;
            startServer();
        } else {
            console.log('couldn\'t find local ip address. letting server down.');
            playVideo();
        }
    });
}

// start local http server
var startServer = function () {
    http.createServer(function (req_, res_) {
        req = req_;
        res = res_;
        if (req.method === 'GET') {
            req.on('close', function() { console.log('error: connection closed'); });
            req.on('data', function(data) { /* void */ });
            req.on('end', function() { parseRequest(); });
        } else {
            console.log('error: no accepted HTTP method');
            respond('0');
        }
    }).listen(port, localAddress);
    console.log('server running at http://'+localAddress+':'+port);
    // query remote server for status
    queryRemote('playing');
}

// parse incoming http requests
var parseRequest = function () {
    var url = urlmod.parse(req.url);
    if (url.href) {
        var cmd = url.href.slice(1);
        if (cmd === 'playing') respond(playing());
        else if (cmd === 'ended') playVideo();
        else respond('bad command');
    } else {
        console.log('bad url');
        respond('error: bad url');
    }
}

// respond to remote http requests
var respond = function (data) {
    var headers = {
        'Content-Length': Buffer.byteLength(data),
        'Content-Type': 'text/plain; charset=utf-8',
        'Expires': (new Date(Date.now)).toUTCString()
    }
    res.writeHead(200, headers);
    res.end(data);
}

// REMOTE QUERIES //////////////////////////

// query remote server
var queryRemote = function (query) {
    var url = 'http://'+remoteAddress+':'+port+'/'+query;
    http.get(url, function(res_) {
        res_.on("data", function (data) { parseServerResponse(data) });
    }).on('error', function(e) {
        console.log("Got error: " + e.message);
    });
}

var parseServerResponse = function (data) {
    if (data === '0') {
        // remote is not playing, play local file
        playVideo();
    } else {
        // wait for remote message, so, do nothing
    }
}

// VIDEO ///////////////////////////////////

// establish video playing status
var playing = function () {
    if (vidProc) return '1';
    else return '0';
}

// play video files
var playVideo = function () {
    var filename = files[currFile];
    vidProc = player === 'omxplayer' ? spawn('omxplayer', ['-o local', filename]) : spawn('mplayer', ['-vm', filename]);
    vidProc.stdout.on('data', function (data) { vidProcLog += data; });
    vidProc.stderr.on('data', function (data) { vidProcLog += data; });
}

// PROCESS /////////////////////////////////

// parse process' incoming arguments
var parseArgv = function () {
    var conf;
    files = [];

    // parse arguments
    process.argv.forEach(function (val, idx, arr) {
        if (val.search(/^\.*[^\.]+\.conf$/) !== -1) {
            // configuration file case
            conf = val;
            // readConf();
        } else if (val.search(/^\.*[^\.]+\.(mp4|m4v|mov)$/) !== -1) {
            // video filename case
            files.push(val);
        } else if (val.search(/192\.168\.1\.\d+/) !== -1) {
            // remote address case
            remoteAddress = val;
        }
    });

    // if a configuration file was given
    if (conf) {
        var data = fs.readFileSync(conf, {encoding:'utf-8'});
        if (data.length) {
            data.split('\n').forEach(function (val, idx, arr) {
                if (val.search(/^\.*[^\.]+\.(mp4|m4v|mov)$/) !== -1) {
                    // video filename case
                    files.push(val);
                } else if (val.search(/192\.168\.1\.\d+/) !== -1) {
                    // remote address case
                    remoteAddress = val;
                }
            });
        }
    }
    
    // if video files were given
    if (files.length) {
        // clear terminal, move cursor to top left and hide it
        console.log('\033[2J\033\033[H\033[?25l');
    }

    // if a remote server address was given
    if (remoteAddress.length) {
        findLocalAddress();
    } else {
        playVideo();
    }
}

// check whether other vidcomm process is running on the system
var checkForDuplicates = function () {
    require('child_process').exec('ps aux | grep '+player+' | grep -v grep', function (error, stdout, stderr) {
        if (stdout.length) {
            console.log('a video player is already running on this machine.');
            console.log(stdout);
            exitFunction();
            process.exit(1);
        } else {
            console.log('vidcomm starting.');
            parseArgv();
        }
    });
}

// handle ctrl-C gracefully
process.on('SIGINT', function () {
    console.log(' ');
    exitFunction();
    process.exit(1);
});

// START ///////////////////////////////////

// check which player is available on the system
require('child_process').exec('which omxplayer', function (error, stdout, stderr) {
    if (stdout[0] !== '/') {
        require('child_process').exec('which mplayer', function (error, stdout, stderr) {
            if (stdout[0] !== '/') {
                console.log('no video player available.');
                exitFunction();
                process.exit(1);
            } else {
                player = 'mplayer';
                checkForDuplicates();
            }
        });
    } else {
        player = 'omxplayer';
        checkForDuplicates();
    }
});