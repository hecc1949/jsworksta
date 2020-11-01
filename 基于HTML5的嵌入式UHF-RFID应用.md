# 基于HTML5的嵌入式UHF-RFID应用 #



## 1. 概述 ##

在ARM平台上用HTML5/C++混合编程，实现UHF-RFID读写应用。

平台是基于Linux-QT，移植有QWebEngine的ARM（Cortex-A9）系统。嵌入式系统对RFID读写器硬件的接口比PC机更稳定，更廉价；同时，带有高分辨率（1920x1080p）、高质量的图形显示，可实现带精美UI界面的RFID应用。

HTML5是UI的最好选择，编程门槛低，有众多的框架、源码可利用，使用者接受度高。但对于底层的应用实现，C/C++还是必须的选择。利用QWebEngine融合两者，C++封装硬件接口和主要业务，内嵌浏览器显示HTML写的UI，Javascript程序执行控制。这个架构有一定的通用性，相同的底层，不同的HTML5页面可实现不同的应用。

C++底层模块是由现有的图书标签制作程序封装而来，本程序目前的功能就是RFID标签的制作、盘点。也可按需要添加其他功能模块，扩展应用范围。

HTML5文件(HTML, CSS, JS)是保存在本机存储器、以本地网页的方式运行的，因此还是一个嵌入式的单机应用，当然，也不难把它部署到服务器上，以Server-Client模式使用。这部分可以在PC端浏览器（Chrome）下打开，界面可在Chrome下预览、调整，不过提供不了devwrapper对象相关的动作。

## 2. 整体结构 ##

UHF-RFID读写器的底层接口处理集中在urfidLib中，这是C++的库。这里用两个类（WriteBookTags，InventProxy）封装了写标签、盘点标签的整体动作过程。由于涉及硬件接口和读写稳定性，这部分程序不需要对具体应用做修改，通过外置的ini/json文件做配置来适应不同要求。

URfidWrapper类对urfidLib库进行了封装，将C++的接口转换成Javascript接口，通过WebChannel导出，在javascipt中对应的对象为devwrapper，通过devwrapper的属性/方法操纵UHF-RFID读写器的各项功能。

应用的主体（main.cpp, conterierwindow.cpp）是用QWebEgine的内嵌浏览器（chromium）运行HTML5页面。HTML/CSS提供UI显示，由Javascript程序控制UI与读写器动作。javascript使用了jquery-easyui库，面向1920x1080p分辨率。

HTML5程序中要用到某些本地功能，如sqlite3数据库，本地文件读写，也封装在URfidWrapper类中，通过WebChannel提供给Javascript使用。H5虽然也有本地文件、数据库读写的功能，但是是约束在DOM内的，使用不是很方便。这里导出的sqlite3相关功能，是以前的图书标签制作程序就具有的。


``` mermaid
graph TB
URfidWrapper -->|C++| urfidLib;
URfidWrapper -->|Javascript| urfidwr.js;

subgraph HTML5
UI-->urfidwr.js;
html/CSS-->UI;
end

subgraph Wrapper
QWebEngine-->|QWebChannel|URfidWrapper;
URfidWrapper-->LocFile;
end

subgraph Platform
RfidReader-->WrtagProxy;
RfidReader-->InventProxy;
WrtagProxy-->urfidLib;
InventProxy-->urfidLib;
end

```

WebChannel是Javascript与C++的接口，本质上是一个Websocket，其实现的细节不必深究，在html文件中导入qwebchannel.js引用即可。

## 3. 实现的功能 ##

整个架构是自己构思和搭建出来的，在现有的硬件环境下，把原来此板上C++编写rfidwritor应用完全移植过来，验证此框架的可行性。

rfidWritor是一个面向图书馆UHF-RFID标签制作、点验的应用，Linux-QT环境，已经经过了生产化使用的考验，它的稳定性是有保证的，但可扩展性不足。按这个HTML5/C++混合编程的框架，平台/C++层不变，只需要在HTML5层做修改，就可以做出适配不同要求程序，将此平台快速用于其他RFID应用场合。






