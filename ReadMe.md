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

2021-6：
做一次完整的优化，包括：
a. 显示分辨率将改成1280x720，为此，将界面显示元素作一次细调。还是在html中定义size相关的style，原ccs文件改名urfidView.css；
    ccs中设置不了的style在js文件中设置，这部分抽取出来，集中在setupViewStyle()
b. 按功能重新设定文件名，增加urfidInvent.js, urfidMisc.js文件，将过于庞大的urfidwr.js文件打散。但这只是把函数平移过去，
    不是模块化。
c. webchannel接口按event/command模式重新封装，这样结构清晰，扩展性好，但代码量加大了，urfidwrapper.cpp显得过大，增加一个urfidAux.cpp文件。
