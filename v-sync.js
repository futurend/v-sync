var spawn = require('child_process').spawn,
    http = require('http'),
    urlmod = require('url'),
    fs = require('fs');
var vidProc,
    player,
    files = [],
    currFile = 0,
    playing = false;
var localAddress = '',
    peerAddress = '',
    port = 3000,
    req,
    res;

// INIT ////////////////////////////////////

var logLevel = 2;

// standardized exit function
var exitFunction = function (code) {
    console.log('exiting');
    if (code) console.log('exited with code '+code);
    // show cursor
    console.log('\033[?12l\033[?25h');
    process.exit();
}

var warn = function (msg) {
    if (logLevel > 0) console.log(msg);
}
var echo = function (msg) {
    if (logLevel > 1) console.log(msg);
}

// HTTP SERVER /////////////////////////////

// find local ip address
var findLocalAddress = function () {
    require('child_process').exec('ifconfig eth0 | grep \'inet addr:\' | cut -d: -f2 | awk \'{ print $1}\'', function (error, stdout, stderr) {
        if (stdout.search(/192\.168\.1\.\d+/) !== -1) {
            localAddress = stdout.trim();
            echo('local ip address: '+localAddress);
            startServer();
        } else {
          require('child_process').exec('ifconfig wlan0 | grep \'inet\' | cut -d: -f2 | awk \'{ print $2}\'', function (error, stdout, stderr) {
              if (stdout.search(/192\.168\.1\.\d+/) !== -1) {
                  localAddress = stdout.trim();
                  echo('local ip address: '+localAddress);
                  startServer();
              } else {
                require('child_process').exec('ifconfig en0 | grep \'inet\' | cut -d: -f2 | awk \'{ print $2}\'', function (error, stdout, stderr) {
                    if (stdout.search(/192\.168\.1\.\d+/) !== -1) {
                        localAddress = stdout.trim();
                        echo('local ip address: '+localAddress);
                        startServer();
                    } else {
                      require('child_process').exec('ifconfig en1 | grep \'inet\' | cut -d: -f2 | awk \'{ print $2}\'', function (error, stdout, stderr) {
                          if (stdout.search(/192\.168\.1\.\d+/) !== -1) {
                              localAddress = stdout.trim();
                              echo('local ip address: '+localAddress);
                              startServer();
                          } else {
                              echo('couldn\'t find local ip address, play in offline mode');
                              echo('-');
                              playNextVideo();
                          }
                      });
                    }
                });
              }
          });
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
    echo('local server running at http://'+localAddress+':'+port);
    echo('-');
    // call peer for status
    callPeer('playing');
}

// parse incoming http requests
var parseRequest = function () {
    var url = urlmod.parse(req.url);
    if (url.href) {
        var cmd = url.href.slice(1);
        echo('peer call: '+cmd);
        if (cmd === 'playing') respond(isPlaying());
        else if (cmd === 'ended') playNextVideo();
        else respond('bad command');
    } else {
        echo('bad request: '+url);
        respond('bad request');
    }
}

// respond to peer http requests
var respond = function (data) {
    echo('response to peer: '+ data);
    var headers = {
        'Content-Length': Buffer.byteLength(data),
        'Content-Type': 'text/plain; charset=utf-8',
        'Expires': (new Date(Date.now)).toUTCString()
    }
    res.writeHead(200, headers);
    res.end(data);
}

// PEER QUERIES //////////////////////////

// call peer
var callPeer = function (msg) {
    echo('call peer: '+ msg);
    var url = 'http://'+peerAddress+':'+port+'/'+msg;
    http.get(url, function(res_) {
        res_.on('data', function (data) { parsePeerResponse(data) });
    }).on('error', function(e) {
        if (e.code === 'ECONNREFUSED') {
            echo('peer isn\'t ready, wait for a call')
            echo('|');
        }
    });
}

// parse peer's response to call
var parsePeerResponse = function (data) {
    echo('peer response: '+ data);
    if (data == 'no') {
        // peer is not playing, play local file
        echo('peer isn\'t playing, play');
        playNextVideo();
    } else {
        echo('peer is playing, wait for a call');
        echo('|');
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
    var filename = files[currFile];
    // if the next file doesn't exist, reset filename
    if (!filename) {
        currFile = 0;
        filename = files[0];
    }
    // play only if the file really exists
    if (!filename) {
        echo('playback ended');
        exitFunction();
    } else {
        currFile++;
        playing = true;
        echo('play video: '+filename);
        echo('..');
        // vidProc = (player === 'omxplayer') ? spawn('omxplayer', ['-o', 'local', filename]) : spawn('mplayer', ['-vm', filename]);
        switch (player) {
          case 'omxplayer':
            vidProc =  spawn(player, ['-o', 'local', filename]);
            break;
          case 'mplayer':
            vidProc = spawn(player, ['-vm', filename]);
            break;
          case 'vlc':
            vidProc = spawn(player, ['-f --play-and-pause', filename]);
            break;
          case '/Applications/VLC.app/Contents/MacOS/VLC':
            vidProc = spawn(player, ['-f --play-and-pause', filename]);
            break;
          case '~/Applications/VLC.app/Contents/MacOS/VLC':
            vidProc = spawn(player, ['-f --play-and-pause', filename]);
            break;
          default:
            vidProc = '';
        }
        vidProc.stdout.on('data', function (data) { echo(data.toString()); });
        vidProc.stderr.on('data', function (data) { echo(data.toString()); });
        vidProc.on('exit', function (code) {
            echo(player+' exited with code '+code);
            playing = false;
            callPeer('ended');
            echo('|');
        });
    }
}

// PROCESS /////////////////////////////////

// parse process' incoming arguments
var parseArgv = function () {
    var conf;
    files = [];

    // parse arguments
    if (process.argv.length < 3) {
        // no arguments case
        conf = 'v-sync.conf';
        echo('no input arguments, will play from: '+conf);
    } else {
        process.argv.forEach(function (val, idx, arr) {
            if (val.search(/^\.*[^\.]+\.conf$/) !== -1) {
                // configuration file case
                conf = val;
                // readConf();
            } else if (val.search(/^\.*[^\.]+\.(mp4|m4v|mov)$/) !== -1) {
                // video filename case
                files.push(val);
            } else if (val.search(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/) !== -1) {
                // peer address case
                peerAddress = val;
            }
        });
        if (conf) echo('input conf file(s): '+conf);
        if (files.length) echo('input video file(s): '+JSON.stringify(files));
        if (peerAddress) echo('input peer ip: '+peerAddress);
    }

    // if a configuration file was given
    if (conf) {
        var data;
        try {
          data = fs.readFileSync(conf, {encoding:'utf-8'});
        } catch (e) {
          warn('couldn´t load '+ conf);
          exitFunction();
          return;
        }
        if (data.length) {
            data.split('\n').forEach(function (val, idx, arr) {
                if (val.search(/^\.*[^\.]+\.(mp4|m4v|mov)$/) !== -1) {
                    // video filename case
                    files.push(val);
                    echo('will play: '+val);
                } else if (val.search(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/) !== -1) {
                    // peer address case
                    peerAddress = val;
                    echo('will connect to: '+val);
                }
            });
        }
        if (files.length) echo('conf video file(s): '+JSON.stringify(files));
        if (peerAddress) echo('conf peer ip: '+peerAddress);
    }

    // if video files were given
    if (files.length) {
        // clear terminal, move cursor to top left and hide it
        // echo('\033[2J\033\033[H\033[?25l');

        // if a peer address was given
        if (peerAddress.length) {
            findLocalAddress();
        } else {
            echo('-');
            playNextVideo();
        }
    }

    // failsafe
    if (!conf && !files.length) {
        exitFunction();
    }
}

// check whether other v-sync process is running on the system
var checkForDuplicates = function () {
    require('child_process').exec('ps aux | grep '+player+' | grep -v grep', function (error, stdout, stderr) {
        if (stdout.length) {
            warn('a video player is already running on this machine');
            warn(stdout);
            exitFunction();
        } else {
            echo('no other video player is running, v-sync will start');
            parseArgv();
        }
    });
}

// handle ctrl-C gracefully
process.on('SIGINT', function () {
    console.log(' ');
    exitFunction();
});

// START ///////////////////////////////////

// check which player is available on the system
require('child_process').exec('which omxplayer', function (error, stdout, stderr) {
    if (stdout[0] !== '/') {
        require('child_process').exec('which mplayer', function (error, stdout, stderr) {
            if (stdout[0] !== '/') {
              require('child_process').exec('which vlc', function (error, stdout, stderr) {
                  if (stdout[0] !== '/') {
                    require('child_process').exec('which /Applications/VLC.app/Contents/MacOS/VLC', function (error, stdout, stderr) {
                        if (stdout[0] !== '/') {
                          require('child_process').exec('which ~/Applications/VLC.app/Contents/MacOS/VLC', function (error, stdout, stderr) {
                              if (stdout[0] !== '/') {
                                  warn('no video player available');
                                  exitFunction();
                              } else {
                                  player = '~/Applications/VLC.app/Contents/MacOS/VLC';
                                  echo('available video player: '+player);
                                  checkForDuplicates();
                              }
                          });
                        } else {
                            player = '/Applications/VLC.app/Contents/MacOS/VLC';
                            echo('available video player: '+player);
                            checkForDuplicates();
                        }
                    });
                  } else {
                      player = 'vlc';
                      echo('available video player: '+player);
                      checkForDuplicates();
                  }
              });
            } else {
                player = 'mplayer';
                echo('available video player: '+player);
                checkForDuplicates();
            }
        });
    } else {
        player = 'omxplayer';
        echo('available video player: '+player);
        checkForDuplicates();
    }
});
