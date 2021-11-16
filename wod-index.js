//#!/usr/bin/env node
var express = require('express');
var app = express();
var http = require('http');
var fs = require("fs");
var path = require("path");
//var bodyparser = require('body-parser');
var devcon = require("./devlinker.js");

//提供http服务,静态路由
app.use(express.static(path.join(__dirname,'/')));
//app.use(express.static(path.join(__dirname,'/view')));
//app.use(bodyparser.json());     //接受json数据类型
//app.use(bodyparser.urlencoded({extended: false}));      //解析post请求数据

/*##
var https = require('https');

var options = {
    key: fs.readFileSync('./keys/sprivate.key'),
    cert: fs.readFileSync('./keys/scaCert.crt'),
//    passphrase: 'hcc9096231'
}
var server = https.createServer(options,app);
*/
var m_operator = {"name":"", "passwd": ""};

var m_InventRecBuf = [];            //点验缓存, 当前组的标签
var m_InventGrpLabels = [];          //分组
var m_hotInventGrpId = 0;           //当前分组（书架）索引
var m_noTagGroups = 0;

//允许跨域
app.use(function(req, res, next)    {
    res.setHeader("Access-Control-Allow-Origin","*");   //请求的来源
    res.header('Access-Control-Allow-Headers',
        'Content-Type,Content-Length,Authorization,Accept,X-Requested-With');    //请求头字段

    res.header('Access-Control-Allow-Methods','PUT,POST,GET,DELETE,OPTIONS'); //请求的方法
    res.header('X-Powered-By', '3.2.1')       //请求的版本
    if(req.method === 'OPTIONS') {    //处理试探请求options
        res.send(req.status);       //让options请求快速返回, or  res.send(200);
    } else {
        next();
    }
});


var server = http.createServer(app);
server.listen(2280, function(req, res)  {
    console.log("nodejs server running @2280.-"+__dirname);

    devcon.wsServerCreate(server, onWsClientMessage, runDevCommand);
    devcon.linkWebchannel(onDeviceEvents);
});

//dev控制命令ajax式接口
app.get("/devCommands", function(req, res) {
    var param = [];
    if (req.query.param !== undefined)    {
        param = JSON.parse(req.query.param);
    }
    if (parseInt(req.query.clientId) !==1 && devcon.getClientCount()>1)    {
        res.send(JSON.stringify({"result":true, "error":"不允许此客户端执行."}));
//        console.log("devCommands: error client.@"+ req.query.clientId);
    }
    else    {
        new Promise(function(resolve, reject)   {
            runDevCommand(req.query.command, param, function(jores)   {
                resolve(jores);
            });
        })
        .then(function(jores)    {
            res.send(JSON.stringify(jores));
        });
    }
});

//直接ajax控制接口
app.get("/commands", function(req, res) {
    var param = [];
    //点验，生成每日txt报告文件
    if (req.query.command === "inventReport") {     //准备invent数据文件
        if (parseInt(req.query.clientId) !==1 && req.query.password !==m_operator.passwd )
        {
            res.send(JSON.stringify({"result":false, "filename":""}));
            return;
        }
        var filename1 = path.join(__dirname + "/reports/invent.txt");
        var filename2 = fileNameforExport(true);
        var prevFile = filename2;
        //先准备目标文件名
        if (fs.existsSync(filename2))    {
            //文件存在，当天已做过下载，则构造xxx-1,xxx-2这样的扩展文件
            var filegroup = 1;
            prevFile = filename2;
            filename2 = fileNameforExport(true, filegroup);
            while(fs.existsSync(filename2)) {
                filegroup++;
                if (filegroup>10)
                    break;
                prevFile = filename2;
                filename2 = fileNameforExport(true, filegroup);
            }
        }
        //
        if (fs.existsSync(filename1) || m_InventRecBuf.length>0)   {
            //有实时数据，改名为报告文件
            inventBufTofile(-1, function()  {
                fs.copyFileSync(filename1, filename2);      //copy，目标文件存在则覆盖
                res.send(JSON.stringify({"result":true, "filename": path.basename(filename2) }));
            });
        }
        else    {
            //没有实时数据，可重复下载
            if (fs.existsSync(prevFile))
                res.send(JSON.stringify({"result":true, "filename": path.basename(prevFile) }));
            else
                res.send(JSON.stringify({"result":false, "error":"数据文件不存在."}));
        }
    }
    //导出写标签数据
    else if (req.query.command ==="miscExportDbRecords")  {     //devCommand相同命令
        if (parseInt(req.query.clientId) !==1 && req.query.password !==m_operator.passwd )
        {
            res.send(JSON.stringify({"result":false, "filename":""}));
            return;
        }
        param = JSON.parse(req.query.param);    //[tabselect, filename]
        if (param[1].length ===0)
            param[1] = fileNameforExport(false);        //fileName替换
        devcon.doDevCommand(req.query.command, param, function(joRes)  {
            if (joRes.result === true && joRes.data[0].error ===0)  {
                m_wrtagEvents.splice(0, m_wrtagEvents.length);
                var jo = {event: "tagwrMsg", param : [{"writedCount":0, "killCount":0}]};
                devcon.wsSeverNotify(jo);       //刷显示

                res.send(JSON.stringify({"result":true, "filename": path.basename(param[1]) }));
            }
            else    {
                res.send(JSON.stringify({"result":false, "error":"数据导出到文件时出错."}));
            }
        });
    }
    //初始化，加载旧数据 (无callback)
    else if (req.query.command ==="loadWorkingDat") {
        res.send(JSON.stringify({"result":true  }));    //unused
        var sel = 0;
        if (req.query.param[0] !== undefined)  {    //typeof req.query.param == object
            sel = parseInt(req.query.param[0]);
        }
        if (sel ===0 && m_wrtagEvents.length===0)   {
            loadUnExportWrRecords(function(wrCount, killCount)  {
                if (wrCount+killCount >0)   {
                    var jo = {event: "tagwrMsg", param : [{"writedCount":wrCount, "killCount":killCount}]};
                    devcon.wsSeverNotify(jo);
                }
            });
        }
        else if (sel ===1)  {
            loadPrevInventRecords();
            var fname1 = path.join(__dirname + "/reports/invent.txt");
            if (fs.existsSync(fname1))
                fs.unlinkSync(fname1);       //rmSync()不支持
        }
    }
    //系统配置页
    else if (req.query.command ==="miscGetSysConfigs")    {         //devCommand相同命令
        //截取系统配置的username/password
        devcon.doDevCommand(req.query.command, [], function(joRes)  {
            var rows = joRes.data;
            for(var i=0; i<rows.length; i++)    {
                if (rows[i].name ==="操作员" && m_operator.name.length ===0)  {
                        m_operator.name = rows[i].value;
                }
                if (rows[i].name ==="工作密码") {
                    if (rows[i].value.length >0 && m_operator.passwd !== rows[i].value)  {
                        m_operator.passwd = rows[i].value;
                    }
                    rows[i].value = "";
                }
            }
            res.send(JSON.stringify({"result":true, "data":rows }));
        });
    }
    else if (req.query.command === "miscSetSysConfigs") {       //devCommand相同命令
        if (parseInt(req.query.clientId) !==1 && req.query.password !==m_operator.passwd )
        {
            res.send(JSON.stringify({"result":false }));
            return;
        }
        param = JSON.parse(req.query.param);    //rows
        devcon.doDevCommand(req.query.command, param, function(joRes)  {
            if (joRes.result === true)  {
                res.send(JSON.stringify({"result":true, "data":joRes.data }));
            }
            else    {
                res.send(JSON.stringify({"result":false }));
            }
        });
    }
});

//为datagrids提供数据
app.get("/inventFoundTags", function(req, res) {
    var pagesize = parseInt(req.query.rows);
    var pagebeg = (parseInt(req.query.page) -1)* pagesize;
    var rs = m_InventRecBuf.slice(pagebeg, pagebeg+pagesize);
    var jodat = {"total": m_InventRecBuf.length, "rows": rs };
    res.send(JSON.stringify(jodat));
});

app.get("/inventGroups", function(req, res) {
    var jodat = [];
    m_InventGrpLabels.forEach(function(item) {
        jodat.push({"text": item});     //datalist的field格式
    });

    res.send(JSON.stringify(jodat));
});

app.get("/wrtagEvents", function(req, res) {    
    var pagesize = parseInt(req.query.rows);
    var pagebeg = (parseInt(req.query.page) -1)* pagesize;
    var rs = m_wrtagEvents.slice(pagebeg, pagebeg+pagesize);
    var jodat = {"total": m_wrtagEvents.length, "rows": rs };
    res.send(JSON.stringify(jodat));
});

//下载文件专用
app.get("/downloadreports", function(req, res) {
    if (req.query.filename !== undefined)  {
        var fpath = __dirname + "/reports/" + path.basename(req.query.filename);    //下载的源文件
        if (fs.existsSync(fpath))    {
            res.download(fpath, function(err)  {    //执行下载
                if (err)    {
                    console.log("download file err:"+fpath);
                }
            });
        }   else {
            res.end(JSON.stringify({"result":false, "error":"not files"}));
        }
    }   else    {
        res.send(JSON.stringify({"result":false, "error": "下载失败！" }));
    }
});

app.get('*', function(req, res) {
    //先运行nodejs, webchannel首次连接会失败，要择机重新连接。另一种处理法，是前端websocket连接时onStart调用。
    if (devcon.webChannelLinekd !== true)   {
        devcon.linkWebchannel(onDeviceEvents);
    }

    res.status(404)
    res.send("找不到资源");
});

//------------------------  Event/Command处理 ----------------------

//底层(webchannel, server)触发Events
function onDeviceEvents(joRes)    {
    if (joRes.event ==='devMsg')   {
        if (joRes.param[0].serverClose !== undefined)  {
            console.log("nodejs server close..");
            process.exit(parseInt(joRes.param[0].serverClose));
        }
    }
    else if (joRes.event === 'inventTagCapture')  {
        onInventTagUpdate(joRes.param[0]);
    }
    else    {
        devcon.wsSeverNotify(joRes);    //简单转发
    }    
}

//前端websocket发来命令
function onWsClientMessage(cmd, callback)   {    
}

//devCommand命令二次分发(执行), 有些命令作一些截断/补充
//  ajax方式，用promis封装，必须执行callback(对应resolve)，且参数带有result:true/false, CPP端执行的
//devcon.doDevCommand()没有可callback的话要在这里补全
function runDevCommand(cmd, param, callback)    {
    if (cmd === "sysClose") {
        if (devcon.getClientCount() <=2)  {
            devcon.doDevCommand(cmd, param, callback);
        }
    }
    else if (cmd ==="inventSetGroupId")     {
        var grpId = param[0];
        if (grpId >=0 && grpId <m_hotInventGrpId)   {
            m_hotInventGrpId = grpId;
        }
        else    {       //参数-1，自动新开组
            inventSetNewGroup(grpId);
        }
        if (callback !== undefined) {
            callback({"result":true});
        }
    }
    else if (cmd ==="tagWrite" || cmd ==="tagKill" || cmd==="tagWriteEpcItem")     {
        devcon.doDevCommand(cmd, param, function(joRes)  {
            if (joRes.result===true &&
                    ((joRes.data[0].result===5 && cmd==="tagWrite")||
                    (joRes.data[0].result===1 && (cmd ==="tagKill" || cmd==="tagWriteEpcItem"))))  {
                var rowId = updateWritedRecord(joRes.data[0], (cmd ==="tagKill"));
                joRes.data[0].cursorRow = rowId;        //增加item
            }
            if (callback !== undefined) {
                callback(joRes);
            }
        });
    }
    else    {
        devcon.doDevCommand(cmd, param, callback);      //直接转发
    }
}

//------------------------ utils一般子函数 ----------------------

function fileNameforExport(isInvent, serial)    {
    var dt = new Date();
    var month = parseInt(dt.getMonth())+1;
    if (month <10)
        month = '0' + String(month);
    var day = dt.getDate();
    if (day <10)
        day = '0'+String(day);
    var hours = dt.getHours();
    if (hours<10)
        hours = '0' + String(hours)
    var minutes = dt.getMinutes();
    if (minutes<10)
        minutes = '0' + String(minutes);
    var fname;
    if (isInvent===true)   {
        fname = "D" + dt.getFullYear() + month + day +"-" + m_operator.name;
        if (serial !== undefined)
            fname = fname + "-" + String(serial);
        fname = fname + ".txt";
    }
    else
        fname = "W" + month + day + "T" + hours+minutes +"-"+ m_operator.name +".csv";
    fname = __dirname + "/reports/" + fname;
    return(fname);
}

//----------------------------------  点验工作 ---------------------------------------------------------
var m_inventCounter = {
    contextInvalidTags: 0,        //格式未知(含空白)的标签数
    frameTags: 0,               //发现的书架标签数
    groupedTags: 0,             //已进行上架分组的标签总数, 包括空白标签
    crossGrpCount: 0            //误读已分组上架标签次数
}

//书架标签格式定义
function filterForFrameTags(joTag)  {
    if (joTag.formatId===undefined || joTag.context===undefined)
        return(false);
    if (joTag.formatId <0 || joTag.context.length<4)
        return(false);
    var fix = false;
    for(var i=0; i<joTag.context.length; i++)   {
        if ((joTag.context[i]>='A' && joTag.context[i]<='Z')||(joTag.context[i]>='a' && joTag.context[i]<='z')) {
            fix = true;
            break;
        }
    }
    return(fix);
}

function inventRefresh(joMsg)    {
    var params = [joMsg];
    if (joMsg.inventCursorRow !== undefined || joMsg.frameTags !== undefined)  {
//        joMsg.foundTags = m_InventRecBuf.length + m_inventCounter.groupedTags + m_inventCounter.frameTags;    //接收到的总数
        joMsg.foundTags = m_InventRecBuf.length + m_inventCounter.groupedTags;    //接收到的书标签数，不含书架标签
        joMsg.contextInvalidTags = m_inventCounter.contextInvalidTags;
    }
    var jo = {event: "inventUpdate", param : params};
    devcon.wsSeverNotify(jo);
}

//接收到标签报告时的处理
function onInventTagUpdate(jo)  {
    var rec = {id: 0, epc: "", hitCount:0};
    rec.epc = jo.epc;
    rec.hitCount = jo.hitCount;
    rec.hitTime = parseInt(jo.hitTime);
    rec.rssi = jo.rssi;
    rec.formatId = jo.formatId;

    //按格式/分组，做预处理
    if (filterForFrameTags(jo)) {       //书架分组标签
        if (jo["append"] && jo.context.length>0)   {
            var same = false;
            for(var item of m_InventGrpLabels) {
                if (item === jo.context)   {
                    same = true;
                    break;
                }
            }
            if (!same)  {
                m_inventCounter.frameTags++;
                if ((m_hotInventGrpId < m_InventGrpLabels.length && m_InventGrpLabels[m_hotInventGrpId][0] === '-') ||
                    (m_hotInventGrpId ===m_InventGrpLabels.length-1 && m_InventRecBuf.length===0))  //当前组是未定义标签，或者在尾部且为空组
                {
                    m_InventGrpLabels[m_hotInventGrpId] = jo.context;     //替换
                }
                else    {
                    m_InventGrpLabels.push(jo.context);
                }
                inventRefresh({"frameTags": m_hotInventGrpId});
            }
        }
        return;
    }
    //分组管理
    if (jo.groupId !== m_hotInventGrpId)    {           //其他分组
        m_inventCounter.crossGrpCount++;
        inventRefresh({"crossGrpCount": m_inventCounter.crossGrpCount});
        return;
    }
    rec.groupNo = jo.groupId +1;
    //
    rec.id = jo.id;     //jo.id保存的是包含全部分组的缓存数组index+1, 包括书架标签，已分组的标签
    if (jo["append"])  {        //初次发现
        if (jo.formatId>=0)
            rec.context = jo.context;       //条码
        else    {
            rec.context = "";
            m_inventCounter.contextInvalidTags++;
        }
        rec.title = jo.title;
        if (jo.securityBit !== undefined)   {
            rec.securityBit = (parseInt(jo.securityBit) !==0);
        }
        m_InventRecBuf.push(rec);
        inventRefresh({"inventCursorRow": m_InventRecBuf.length-1});
    }
    else    {     //重复发现
        var rowid = -1;
        try {
            m_InventRecBuf.forEach(function(row, rid)   {
                if (row.epc === rec.epc)   {
                    //不能在这个循环中对row直接进行操作，取出的row object是错误的
                    rowid = rid;
                    throw new Error("EndInterative");   //break forEach
                }
            });
        }   catch(e)   {
            if (e.message !== "EndInterative")   throw e;
        }
        //
        if (rowid >=0)  {
            var prev_tick = parseInt(m_InventRecBuf[rowid].hitTime);
            if (parseInt(rec.hitTime) - prev_tick > 25)  {      //引用object的数值域也要加parseInt()
                //update模式rec中部分域没有定义，只对定义了的域刷新
                for (var tmpfiled in m_InventRecBuf[rowid]) {
                    if (rec[tmpfiled] !== undefined)
                        m_InventRecBuf[rowid][tmpfiled] = rec[tmpfiled];
                }
                inventRefresh({"inventCursorRow": rowid});
            }
        }
    }
}

function inventSetNewGroup(grpId)    {
    var nowGrp = m_hotInventGrpId;
    //前端命令新开组, grpId=-1
    if (m_hotInventGrpId < m_InventGrpLabels.length-1)  {   //已有书架标签
        m_hotInventGrpId++;
    }
    else if (m_InventRecBuf.length>0)   {
        m_noTagGroups++;
        var label = "-Undefined_" + m_noTagGroups;
        m_InventGrpLabels.push(label);
        m_hotInventGrpId = m_InventGrpLabels.length-1;
    }

    if (nowGrp < m_hotInventGrpId)  {
        inventBufTofile(nowGrp);
        devcon.doDevCommand("inventSetGroupId", [m_hotInventGrpId]);
    }
    inventRefresh({"inventCursorRow": 0, "frameTags":  m_hotInventGrpId,
        "groupedTags": m_inventCounter.groupedTags});     //inventCursorRow<0清空显示datagrid
}

//点验模式，当前组保存到txt文件
function inventBufTofile(grpId, callback)  {
    if (grpId <0)   {       //生成txt报告时, 转换并清空当前缓存
        grpId = m_hotInventGrpId;
        if (m_InventRecBuf.length ===0) {
            if (callback !== undefined) {
                callback();
            }
            return;
        }
        //追加功能： 数据库export
        devcon.doDevCommand("inventResetLet",[true], function(joRes)   {   //清exportmark, 不导出csv
            m_InventGrpLabels.splice(0, m_InventGrpLabels.length);        //清空
            m_hotInventGrpId = 0;           //当前分组（书架）索引
            m_inventCounter.groupedTags = 0;
            inventRefresh({"inventCursorRow": 0, "frameTags": 0,
                              "groupedTags": m_inventCounter.groupedTags});  //刷显示
        });
    }

    m_inventCounter.groupedTags += m_InventRecBuf.length;
    //转换到缓存lines[]
    var lines = [];
    var title = "#" + String(grpId+1) + "(" + String(m_InventRecBuf.length) +")  " + m_InventGrpLabels[grpId]  +'\r\n';
    lines.push(title);
    for(var i=0; i<m_InventRecBuf.length; i++)  {
        if (m_InventRecBuf[i].context.length >0)
            lines.push(m_InventRecBuf[i].context +'\r\n');
        else
            lines.push("<" + m_InventRecBuf[i].epc + ">\r\n");
    }
    m_InventRecBuf.splice(0, m_InventRecBuf.length);        //清空
    //保存文件
    var fname = path.join(__dirname + "/reports/invent.txt");
    var wrstream = fs.createWriteStream(fname, {flags:'a+', encoding:'utf-8'});
    //流模式是异步执行，捕捉流关闭event执行callback很重要；下一步有对文件的操作，放在callback中执行，否则
    //异步模式下，"下一步"对文件的操作会发在在流关闭之前，导致写人数据丢失。
    wrstream.once("close",function () {
        if (callback !== undefined) {
            callback();
        }
//        console.log("~~~~可写流已经关闭");
    });
    wrstream.cork();        //使用内存缓冲
    for(var j=0; j<lines.length; j++) {
        wrstream.write(lines[j]);
    }
    wrstream.end();
    wrstream.uncork();
/*# 在fs中用同步模式，也可以，效率要差一些
    var fd = fs.openSync(fname, 'a+');
    for(var j=0; j<lines.length; j++) {
        fs.writeSync(fd,lines[j]);
    }
    fs.closeSync(fd);
    if (callback !== undefined) {
        callback();
    }
*/
}

var _prevInventDataLoaded = false;
function loadPrevInventRecords()   {
    if (_prevInventDataLoaded === true)
        return;
    var query = "Select MAX(grp_id) AS maxGrpId from invents Where (exportMark=0)";
    devcon.doDevCommand("miscExecDbSql", [query], function(joRes)  {
        if (joRes.result===true && joRes.data[0].error.code ===0 && joRes.data[0].rows[0][0].length>0)  {
            var grpid = parseInt(joRes.data[0].rows[0][0]);
            query = "Select invent_id, EPC, itemIdentifier, grp_id2 from invents Where (exportMark=0 AND grp_id=?)";
            devcon.doDevCommand("miscExecDbSql", [query, grpid], function(jo2)  {
                if (jo2.result===true && jo2.data[0].error.code ===0)  {
                    var rowNum = jo2.data[0].rows.length;
                    var frametag = "";
                    for(var i=0; i<rowNum; i++) {
                        var arow = jo2.data[0].rows[i];
                        var rec = {};               //必须是local的
                        rec.id = parseInt(arow[0]);
                        rec.epc = arow[1];
                        rec.context = arow[2];
                        rec.formatId = parseInt(arow[3]);
                        if (!filterForFrameTags(rec))   {
                            m_InventRecBuf.push(rec);
                        }
                        else if (frametag.length===0)    {
                            frametag = rec.context;
                        }
                    }
                    if (rowNum >0)  {
                        for(var j=0; j<=grpid; j++)  {
                            var label = "-Unknow_" + j;
                            m_InventGrpLabels.push(label);
                        }
                        if (frametag.length>0 && m_InventGrpLabels.length>0)   {
                            m_InventGrpLabels[grpid] = frametag;      //最后一个书架标签
                        }
                        m_hotInventGrpId = grpid;
                        inventRefresh({"inventCursorRow": rowNum-1, "frameTags": grpid});
                    }
                }
            });
        }
    });
    _prevInventDataLoaded = true;
}

//----------------------------------  写标签工作 ---------------------------------------------------------
var m_wrtagEvents = [];
var m_wrCount = 0;
var m_killCount = 0;
function updateWritedRecord(joRes, isKill)   {
    var rec = {
        evtype: "写入",
        wrtime:"",
        tagformat:""
    }
    rec.wrtime = new Date();
    rec.context = joRes.context;
    rec.epc = joRes.epc;
    rec.tagserial = joRes.tagSerial;

    var rowid = -1;
    if (isKill) {
        rec.evtype = "灭活";
        rec.count = joRes.killCount;
    }
    else    {
        rec.count = joRes.wrCount;
        if (joRes.writeUsrBank !== undefined)
            rec.wrUsrBank = joRes.writeUsrBank;
        if (joRes.setLocker !== undefined)
            rec.locked = joRes.setLocker;
        if (joRes.wrCount <= m_wrCount)  {
            //列表中查找
            try {
                m_wrtagEvents.forEach(function(row, rid)   {
                    if (row.tagserial === rec.tagserial)    {
                        rowid = rid;
                        throw new Error("EndInterative");
                    }
                });
            }   catch(e)   {
                if (e.message !== "EndInterative")   throw e;
            }
            if (rowid >=0)  {
                rec.evtype = "改写";
            }
        }
    }
    //    
    if (rowid >=0)  {           //update
        for (var tmpfiled in m_wrtagEvents[rowid]) {
            if (rec[tmpfiled] !== undefined)
                m_wrtagEvents[rowid][tmpfiled] = rec[tmpfiled];    //这里还有点Bug:如果初始rows[]中没有的field，是不会加入的
        }
    }
    else    {
        m_wrtagEvents.push(rec);
        if (isKill)
            m_killCount++;
        else
            m_wrCount++;
        rowid = m_wrtagEvents.length -1;
    }
    return(rowid);
}

var _wrtag_unexport_loaded = false;
function loadUnExportWrRecords(callback)    {     
    if (_wrtag_unexport_loaded) {
        if (callback !== undefined && typeof callback === 'function') {
            callback(m_wrCount, m_killCount);
        }
        return;
    }
//#    var query = "Select * from writedtags where exportMark=0 ";
    var query = "Select dailycount,itemIdentifier,EPC,tagSerialNo,aversion,usrBankWrited,lockAction,writetime ";
    query = query + " from writedtags where(exportMark=0)";
    devcon.doDevCommand("miscExecDbSql", [query], function(joRes)  {
        if (joRes.data[0].error.code ===0)  {
            var rowNum = joRes.data[0].rows.length;
            for(var i=0; i<rowNum; i++) {
                var arow = joRes.data[0].rows[i];
                var rec = {};               //必须是local的
                rec.count = parseInt(arow[0]);      //daily_id, 1,
                rec.context = arow[1];      //itemIdentifier,4
                rec.epc = arow[2];          //epc,5
                rec.tagserial = arow[3];    //tagSerialNo,6
                if (parseInt(arow[4]) === 64)   {   //aversion,7
                    rec.evtype = "灭活";
                    m_killCount++;
                }
                else    {
                    rec.evtype = "写入";
                    m_wrCount++;
                }
                rec.wrUsrBank = (parseInt(arow[5]) !== 0);  //usrBankWrited,8
                rec.locked = (parseInt(arow[6]) !== 0);    //lockAction,10
                rec.wrtime = Date.parse(arow[7]);      //writetime,11
                m_wrtagEvents.push(rec);
            }
        }
        if (callback !== undefined && typeof callback === 'function') {
            callback(m_wrCount, m_killCount);
        }
    });
    _wrtag_unexport_loaded = true;
}
