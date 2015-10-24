var fs = require('fs');
var path = require('path');
var readline  = require('readline');

function getBinary32(number) {
    "use strict";
    var b = new Buffer(4);
    b.writeFloatLE(number);
    return b;
}
function copyFile(source, target, cb) {
    var cbCalled = false;

    var rd = fs.createReadStream(source);
    rd.on("error", function(err) {
        done(err);
    });
    var wr = fs.createWriteStream(target);
    wr.on("error", function(err) {
        done(err);
    });
    wr.on("close", function(ex) {
        done();
    });
    rd.pipe(wr);

    function done(err) {
        if (!cbCalled) {
            if(err) console.log("couldn't copy file");
            cb(err);
            cbCalled = true;
        }
    }
}

function findFolders (data){
    "use strict";
    var folderList = [];
    return new Promise(function(resolve, reject) {
        try {
            // nobody in their right mind would parse it like that
            // I am deeply sorry for this
            var singleStringData = (data.split("\n").join("#\\n#"));
            var libFoldersFinder = /"LibraryFolders"#\\n#\{#\\n#(.*)#\\n#}/g;
            var dirFinder = /"(\d)"\t\t"(.*?)"/g;
            var libraryFolders = libFoldersFinder.exec(singleStringData)[1];

            var results = [];
            while (1) {
                results = dirFinder.exec(libraryFolders);
                if(results){
                    folderList.push(results[2].replace(/\\\\/g,"\\"))
                } else break;
            }
        } catch (x) {
            reject(x)
        }
        if (folderList.length) {
            console.log("Steam library folders detected: ", folderList);
            resolve(folderList)
        } else {
            reject("no folders found")
        }
    });

}
function readVDF() {
    "use strict";

    return new Promise(function(resolve, reject) {
        fs.readFile(defaultLibRegistry, 'utf8', function (err,data) {
            if(err){
                reject(err)
            } else {
                resolve(data)
            }
        });
    });
}
function findMGS(folderList) {
    "use strict";

    folderList = folderList.map(function(s){
        return path.join(s, "\\SteamApps\\common\\MGS_TPP\\mgsvtpp.exe")
    });
    var promisesList = folderList.map( function(str) {
        return new Promise(function(resolve,reject){
            fs.access(str, function (err) {
                if(err) {
                    resolve(false)
                } else {
                    resolve(str)
                }
            });
        });
    });

    return new Promise(function(resolve, reject) {
        Promise.all(promisesList)
            .then(function(values){
                var executables = (values.filter(function(s){return s}));
                if(executables.length) {
                    if(executables.length > 1) {
                        var options = executables.map(function(v,index){
                            return "\n["+(index+1)+"]: "+v
                        });

                        rl.question("I detected more than one executable, which one to patch?  "+ options+"\n", function(answer) {
                            answer =  parseInt(answer);
                            if(answer<1 || answer > options.length) {
                                console.log("okay,exiting");
                                finish()
                            } else{
                                resolve(executables[answer-1]);
                            }
                        })
                    } else {
                        resolve(executables[0]);
                    }
                } else {
                    reject ()
                }
            })
    });
}
function askUserForManualPath(){
    "use strict";
    return new Promise(function(resolve,reject){
        rl.question("Couldn't find MGS executable automatically, enter the full path to mgsvtpp.exe\n", function(answer) {
            if(answer.length > 0) {
                resolve(answer)
            }else{
                console.log("okay, exiting");
                rl.close();
                process.exit();
            }
        });
    });


}

function doTheSED(filename, callback) {
    "use strict";

    var size = fs.statSync(filename).size;
    fs.open(filename,"r+", function (err, fd) {
        if(err) {
            fs.closeSync(fd);
            callback(err);
        }
        else {
            var position = 0;
            var dword = new Buffer(4);
            while(position<size){
                fs.readSync(fd,dword,0,4,position);
                if(dword.equals(defaultBytes)) {
                    var bufStr = new Buffer(16);
                    var offsetStr = position.toString(16);
                    while(offsetStr.length < 8) offsetStr = "0"+offsetStr;
                    fs.readSync(fd,bufStr,0,16, position-(position%16));
                    console.log("found offset", offsetStr, bufStr );
                    fs.writeSync(fd,newBuffer,0,4,position);
                    break;
                }
                if(position%1000000 == 0) console.log("\r"+position+"/"+size+" bytes");
                position++;

            }
            fs.closeSync(fd);
            callback()
        }

    });
}
function patchMGS(executable){
    "use strict";
    //literally just search all 70megs of executable
    return new Promise(function (resolve, reject) {
        console.log("Backing up original executable");
        copyFile(executable,executable+".bkup", function(err){
            if(err) reject(err);
            else {
                console.log("Attempting to patch ", executable);
                doTheSED(executable, function(err){
                    if(err) console.log(err);
                    resolve()

                })
            }
        });
    });
}

function askForResolution(callback){
    "use strict";

    rl.question("Enter your desired resolution (for example, 2560x1080): ", function(answer2) {
        answer2 = answer2.trim().split("x");
        aspectRatio = parseInt(answer2[0]) / parseInt(answer2[1]);
        newBuffer = getBinary32(aspectRatio);
        console.log("Your new aspect ratio dword will be ", newBuffer);
        callback();
    });
}

function getResolution(){
    "use strict";
    console.log("Trying to detect display resolution");
    var exec = require('child_process').exec;
    var cmd = 'wmic path Win32_VideoController  get CurrentHorizontalResolution,CurrentVerticalResolution /format:value';

    return new Promise(function(resolve,reject){
        exec(cmd, function(error, stdout, stderr) {
            if(error) {
                console.log("Error occured while determining display resolution:",error);
                askForResolution(resolve);
            } else {
                var getter = /(\w+)=(\d+)/g;
                var s = stdout.toString();
                var values = s.split("\n").filter(function(s) {return s.indexOf("=")!=-1});
                var o = {};
                values.map(function(v){
                    getter.lastIndex =0;
                    var pair = getter.exec(v);
                    o[pair[1]] = pair[2]
                });
                //console.log(o);
                rl.question("I detected your display resolution: "+o["CurrentHorizontalResolution"]+"x"+o["CurrentVerticalResolution"]+", is that okay? y/n ", function(answer) {
                    answer = answer.toLocaleLowerCase();
                    switch (answer){
                        case "y":
                        case "yes":
                            aspectRatio = parseInt(o["CurrentHorizontalResolution"]) / parseInt(o["CurrentVerticalResolution"]);
                            newBuffer = getBinary32(aspectRatio);
                            console.log("Your new aspect ratio dword will be ", newBuffer);
                            resolve();
                            break;
                        case "n":
                        case "no":
                            askForResolution(resolve);
                            break;
                        default:
                            console.log("okay, exiting");
                            rl.close();
                            process.exit();
                    }
                });
            }
        });
    });
}
function finish(){
    "use strict";

    rl.close();
    console.log("Finished!");
    process.exit();

}
var rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});
var aspectRatio  = 16/9;
var newBuffer = getBinary32(aspectRatio);
var defaultLibRegistry = "C:\\Program Files (x86)\\Steam\\steamapps\\libraryfolders.vdf";
var defaultBytes = new Buffer("398EE33F","hex");
Promise.resolve(0)
    .then(getResolution)
    .then(readVDF)
    .then(findFolders)
    .then(findMGS)
    .catch(askUserForManualPath)
    .then(patchMGS)
    .then(finish);




