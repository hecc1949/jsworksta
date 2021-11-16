## QWebEngine/Js工作站应用 ##

这是自己构思的全新架构，也许适合于物联网图形终端类的应用。

以QT WebEngine作为应用层平台，它带有内嵌浏览器，可以执行html5应用。底层用C/CPP接口硬件设备，执行工作任务；上层用HTML5/Javascript写应用界面。

Web页面界面是使用最广泛的UI，可以用HTML5/Javascrip快速制作，按用户要求修改计较容易。涉及硬件设备的业务应用，则要精心调试，稳定后不需要太多修改，最适合的还是c/cpp。

通过Webengine，把CPP写的业务应用封装成浏览器可以接口的Web对象，则用HTML5/Js可以快速地用同一硬件平台，构建满足不同用户需求的应用。


先把现有在ARM平台下已经稳定的UHF-RFID Writor应用移植过来，构建一个完整的架构，验证此路线的可行性。


2020-11-1:
此架构验证可行。应用于UHF-RFID标签制作提交使用测试。

2020-12:
图书馆实用测试，主要用点验功能；根据反馈优化，加点验分组和数据上传功能。
应用在s5p4418平台, 1920x1080分辨率，一体机。

2021-6 -- 2021-7：
做一次完整的优化，包括：
a. 显示分辨率将改成1280x720，为此，将界面显示元素作一次细调。还是在html中定义size相关的style，原ccs文件改名urfidView.css；
    ccs中设置不了的style在js文件中设置，这部分抽取出来，集中在setupViewStyle()
b. 按功能重新设定文件名，增加urfidInvent.js, urfidMisc.js文件，将过于庞大的urfidwr.js文件打散。但这只是把函数平移过去，
    不是模块化。
c. webchannel接口按event/command模式重新封装，这样结构清晰，扩展性好，但代码量加大了，urfidwrapper.cpp显得过大，增加一个urfidAux.cpp文件。
d. invent做了一些改动，对分类计数/分组和clearLet的功能定义/未导出groupId的处理/强行操作的messager处理等功能进行了调整，对应urfidLib也调整。
    感觉在分组和数据重载的问题还很别扭，有Bug，这个和架构有关，用foreend-server-device架构才好处理，先勉强用。
e. writetag功能大修改，增加直接改写安全位和修复EPCbank的PC字功能（修复被误写PC值后标签容量缩小为32bit，不能正常读写的标签)。这里主要还是在
    urfidLib中做修改。存储/计数处理上，改写安全位沿用普通的标签读写，修复EPCsize则不存储。
版本号改到0.1.2

2021-7-14:
    writeTag修改Bug: 找标签时，发现空白标签停止的findTagTick信号在读出内容的findTagUpdate之前发出了，导致空白标签被认为"未读出"但
    (显示已完整读出)，不能快速启动写动作。提示信息作了一些小修改。
    invent修改小Bug: 清空旧数据再开始点验，跳过了自动开新组，下一个执行inventNewGroup()会出现m_hotInventGrpId=-1的错误。

2021-11-15:
    改到服务器-客户端合一的三端模式，版本号升级到0.2.0
    QT/CPP端修改，套用rfidGuard中成型的模式；引入localtoolbar.cpp实现本机文件-联网相关的功能，是现成的，增加一个action做本机文件删除功能；
加入WebsocketChannel.cpp独立webchannel功能；其他功能不变,不用的也保留；
    功能调试时，getSysConfigs()/setSysConfigs()作小调整，增加密码保存功能，exportDbRecords()把导出文件路径从csv/改到reports/。
    引入nodejs后端，主要功能程序移到wod-index.js。command/event转发方面做了一些折腾，原有的webchannel callback不好简单移植到websocket
client，引入socket.io替代,但实际没有用socket.io来封装，而是使用ajax； 尝试加入promise。
    原来前端的应用功能移到后端实现，urfidMisc.js的程序大量删除，urfidInvent.js, urfidwr.js简化改写，数据源管理放到后端的wod-index.js，
截断inventTagCapture Event和tagWrite/tagKill/tagWriteEpcItem devCommand的callback, 在后端构建两个datagrid的数据源。整理之后
原来前端js直接发给QT/C++的devCommand分流成两类: 一是devCommands路由，执行设备控制，基本是直接转发即可，加上clientId管理权限；二是数据相关
的一些功能，用commands路由，以nodejs处理为主，不需要clientId权限管理。(但其中inventSetGroupId功能放在devCommands路由还有疑义，似乎放在
commands路由更合理）
    点验功能的另一datagrid, 书架标签的管理，也放到后端管理。做了一些功能调整，书架标签只是放到一个list, 不具备产生新分组的功能, 只能由前端
命令分组。分组功能的逻辑还不够清晰，是比较容易出错的点。
    写标签功能在前端做了重要调整， 用getValidTag(),afterStopScan()两个函数判断和执行自动写入，结构更清晰；加入快速模式，对非空白标签也可
直接改写。
    条码重复的判断，改成只用Un-export的记录集判断，这是在urfidLib中做的修改。
    原来的数据管理页取消，数据导出csv/txt功能与文件下载功能合并，用“下载”来执行文件copy。下载之前做数据转换，截断inventReport/miscExportDbRecords
命令，生成文件返回文件名，前端callback中filedownload()启动下载。文件下载做了优化，rfidGuard中是用嵌入超链接a执行下载，发现会使页面刷新，
改用iframe来做。页面刷新的问题也提示谨慎使用js自执行函数，把前端原来分布在各文件的自执行js取消，封装在一个自执行setupViewStyle()中，这又导致
初始化过程要做一些细节修改。
    点验和写标签都增加了未导出数据重载到datagrid显示功能，用miscExecDbSql实现，但是如果数据量大，是否会大幅度影响启动速度还需要观察。
    前端在datagrid的使用技巧上获得了一些提升，css中用.datagrid-row设定行距，$().datagrid({ pageSize: })设定页，onLoadSuccess中设定
光标，都是切实解决问题的技术。
    不同客户端权限管理上，用clientId来区分。本机clientId=1,能执行全部功能；设备控制devCommand只有本机能使用， 其他设备登录只能用文件相关功能。
    实践中发现，多客户端登录时，其他客户端未退出浏览器而本机关机重开，会误登录为非1号客户端导致不能用正常功能。修改socket.io的connected/disconnect
消息，能在statusBar显示其他客户端的登录信息；其他客户端也能用关机功能，但限于关闭页面，本机关机时能关闭其他客户端的页面。socket.io自动发出的disconnect
消息为这个提供便利。





