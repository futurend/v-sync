var spawn = require('child_process').spawn,
    http = require('http'),
    urlmod = require('url'),
    fs = require('fs');
var logLevel = 1;
var vidProc,
    player,
    vidProcLog = '',
    files = [],
    currFile = 0,
    playing = false;
var localAddress = '',
    peerAddress = '',
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

var echo = function (msg) {
    if (logLevel > 0) console.log(msg);
}

// HTTP SERVER /////////////////////////////

// find local ip address
var findLocalAddress = function () {
    require('child_process').exec('ifconfig eth0 | grep \'inet addr:\' | cut -d: -f2 | awk \'{ print $1}\'', function (error, stdout, stderr) {
        if (stdout.search(/192\.168\.1\.\d+/) !== -1) {
            localAddress = stdout;
            echo('local ip address is '+localAddress);
            startServer();
        } else {
            echo('couldn\'t find local ip address, play in offline mode');
            playNextVideo();
        }
    });
}

// start local http server
var startServer = function () {
    http.createServer(function (req_, res_) {
        req = req_;
        res = res_;
        if (req.method === 'GET') {
            req.on('close', function() { echo('connection remotely closed'); });
            req.on('data', function(data) { /* void */ });
            req.on('end', function() { parseRequest(); });
        } else {
            echo('error: no accepted HTTP method');
            respond('no');
        }
    }).listen(port, localAddress);
    echo('server running at http://'+localAddress+':'+port);
    // query peer for status
    queryPeer('playing');
}

// parse incoming http requests
var parseRequest = function () {
    echo('network request is:');
    var url = urlmod.parse(req.url);
    if (url.href) {
        var cmd = url.href.slice(1);
        echo('  '+cmd);
        if (cmd === 'playing') respond(isPlaying());
        else if (cmd === 'ended') playNextVideo();
        else respond('bad command');
    } else {
        echo('bad request url: '+url);
        respond('error: bad request url');
    }
}

// respond to peer http requests
var respond = function (data) {
    echo('network response: '+ data);
    var headers = {
        'Content-Length': Buffer.byteLength(data),
        'Content-Type': 'text/plain; charset=utf-8',
        'Expires': (new Date(Date.now)).toUTCString()
    }
    res.writeHead(200, headers);
    res.end(data);
}

// PEER QUERIES //////////////////////////

// query peer
var queryPeer = function (query) {
    echo('query peer '+ query);
    var url = 'http://'+peerAddress+':'+port+'/'+query;
    http.get(url, function(res_) {
        res_.on('data', function (data) { parsePeerResponse(data) });
    }).on('error', function(e) {
        if (e.code === 'ECONNREFUSED') {
            echo('peer is not ready, wait for its call')
        }
    });
}

// parse peer's response to query
var parsePeerResponse = function (data) {
    echo('peer response: '+ data);
    if (data == 'no') {
        // peer is not playing, play local file
        echo('peer isn\'t playing, play');
        playNextVideo();
    } else {
        echo('peer is playing, wait for its call');
        // wait for peer message, so, do nothing
    }
}

// VIDEO ///////////////////////////////////

// establish video playing status
var isPlaying = function () {
    if (playing) return 'yes';
    else return 'no';
}

// play video files
var playNextVideo = function () {
    // next file to play
    var filename = files[currFile++];
    // if it doesn't exist, reset filename to the first one
    if (!filename) filename = files[0];
    // play only if the file exists
    if (!filename) {
        console.log('vidcomm playback ended');
        exitFunction();
        process.exit(0);
    } else {
        playing = true;
        echo('play video '+filename);
        vidProc = (player === 'omxplayer') ? spawn('omxplayer', ['-o', 'local', filename]) : spawn('mplayer', ['-vm', filename]);
        vidProc.stdout.on('data', function (data) { vidProcLog += data; });
        vidProc.stderr.on('data', function (data) { vidProcLog += data; });
        vidProc.on('exit', function (code) {
            playing = false;
            echo(player+' exited with code '+code);
            queryPeer('ended');
        });
    }
}

// PROCESS /////////////////////////////////

// parse process' incoming arguments
var parseArgv = function () {
    echo('parse argv');
    var conf;
    files = [];

    // parse arguments
    if (process.argv.length < 3) {
        // no arguments case
        conf = 'vidcomm.conf';
    } else {
        process.argv.forEach(function (val, idx, arr) {
            if (val.search(/^\.*[^\.]+\.conf$/) !== -1) {
                // configuration file case
                conf = val;
                // readConf();
            } else if (val.search(/^\.*[^\.]+\.(mp4|m4v|mov)$/) !== -1) {
                // video filename case
                files.push(val);
            } else if (val.search(/192\.168\.1\.\d+/) !== -1) {
                // peer address case
                peerAddress = val;
            }
        });
    }

    // if a configuration file was given
    if (conf) {
        var data = fs.readFileSync(conf, {encoding:'utf-8'});
        if (data.length) {
            data.split('\n').forEach(function (val, idx, arr) {
                if (val.search(/^\.*[^\.]+\.(mp4|m4v|mov)$/) !== -1) {
                    // video filename case
                    files.push(val);
                } else if (val.search(/192\.168\.1\.\d+/) !== -1) {
                    // peer address case
                    peerAddress = val;
                }
            });
        }
    }
    
    // if video files were given
    if (files.length) {
        // clear terminal, move cursor to top left and hide it
        // console.log('\033[2J\033\033[H\033[?25l');

        // if a peer address was given
        if (peerAddress.length) {
            findLocalAddress();
        } else {
            playNextVideo();
        }
    }

    // failsafe
    if (!conf && !files.length) {
        exitFunction();
        process.exit(1);
    }
}

// check whether other vidcomm process is running on the system
var checkForDuplicates = function () {
    require('child_process').exec('ps aux | grep '+player+' | grep -v grep', function (error, stdout, stderr) {
        if (stdout.length) {
            console.log('a video player is already running on this machine');
            console.log(stdout);
            exitFunction();
            process.exit(1);
        } else {
            echo('no video player is running, vidcomm will start');
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
                console.log('no video player available');
                exitFunction();
                process.exit(1);
            } else {
                player = 'mplayer';
                echo('available video player is '+player);
                checkForDuplicates();
            }
        });
    } else {
        player = 'omxplayer';
        echo('available video player is '+player);
        checkForDuplicates();
    }
});