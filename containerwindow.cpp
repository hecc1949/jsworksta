#include "containerwindow.h"
#include "ui_containerwindow.h"
#include <QDesktopWidget>
#include <QDebug>
#include <QDateTime>
#include <QTimer>
#include <QtWebEngineWidgets>
//#include <QLocale>

ContainerWindow::ContainerWindow(QWidget *parent) :
    QMainWindow(parent),
    ui(new Ui::ContainerWindow), wschannel(), devwrapper(this)
{
    ui->setupUi(this);

#ifdef ARM
    QDesktopWidget* desktop = QApplication::desktop();
    setGeometry(0, 0, desktop->width(),desktop->height());
#else
    setGeometry(0, 0, 1280, 720);
#endif
    setWindowFlags(Qt::FramelessWindowHint);
    setFocusPolicy(Qt::ClickFocus);
    setWindowIcon(QPixmap(":/res/list_bullets_48px.png"));
//    QNetworkProxyFactory::setUseSystemConfiguration(false);

    wschannel.registerObject(QStringLiteral("devwrapper"),&devwrapper);
    loadWebView();
//    setupFace();

    //
    m_tfcardPath = "/media/hcsd";
    m_udiskPath = "/media/udisk";
    localTools = new LocalToolBar(this);
    addToolBar(localTools);
#if defined(ARM) || defined(A64)
    fsWatcher.addPath("/media");
    connect(&fsWatcher, SIGNAL(directoryChanged(QString)), localTools, SLOT(onSysDeviceChange(QString)));
#endif
    localTools->setAutoShow(5000);

    //网络检测
    m_netInfo.netStatus = 0;
    netChecker = new NetworkChecker(NULL);          //手工delete
//    connect(netChecker, SIGNAL(sigCheckNetDone(NetworkInfo_t)), this, SLOT(onNetworkStatusUpdate(NetworkInfo_t)));
    connect(netChecker, &NetworkChecker::sigCheckNetDone, this, [=](NetworkInfo_t netInfo)    {
        m_netInfo = netInfo;
    });
    netChecker->moveToThread(&netmgrThread);
    netmgrThread.start();

    QTimer *startAppTimer = new QTimer(this);
    startAppTimer->setSingleShot(true);
    connect(startAppTimer, &QTimer::timeout, this,[=]() {
        netChecker->checkNetworkStatus();
    });
    startAppTimer->start(2000);

    ui->statusBar->hide();
}

ContainerWindow::~ContainerWindow()
{
    delete ui;
}

void ContainerWindow::loadWebView()
{
//    m_webview = new WebPageView(this);
    m_webview = new WebSinglePageView(this);
    WebPage *page = new WebPage(QWebEngineProfile::defaultProfile(), m_webview);
    m_webview->setPage(page);

#ifdef USE_LOCAL_WEBSERVER
    QUrl url = QUrl(QStringLiteral("http://localhost:2280/urfidbooks.html"));
#else
    QUrl url = QUrl("file://" + QCoreApplication::applicationDirPath() + "/urfidbooks.html");
#endif

    m_webview->setUrl(url);

    connect(m_webview, &QWebEngineView::urlChanged,[this](const QUrl &url) {
        ui->statusBar->showMessage(url.toString());
    });
//    connect(m_webview, &WebPageView::loadProgressStatus, [=](int progress) {
    connect(m_webview, &WebSinglePageView::loadProgressStatus, [=](int progress) {
#ifdef USE_LOCAL_WEBSERVER
        if (progress<0)     //服务端未运行，加载失败，重新连接
        {
            loadNodejsServer();

            QEventLoop loop;
            QTimer::singleShot(1000, &loop, SLOT(quit()));
            loop.exec(QEventLoop::ExcludeUserInputEvents);
            m_webview->setUrl(url);
        }
#else
    Q_UNUSED(progress);
#endif
    });
    connect(m_webview, &WebSinglePageView::naviActionChanged, [this](QWebEnginePage::WebAction, bool) {
    });
    connect(m_webview, &WebSinglePageView::linkHovered, [this](const QUrl &url)   {
        ui->statusBar->showMessage(url.toString());
    });
    connect(m_webview, &WebSinglePageView::onDownloading, [this](QString prompt)    {
        ui->statusBar->showMessage(prompt, 0);
    });

    setCentralWidget(m_webview);
    centralWidget()->setObjectName("workClient");

    connect(&devwrapper, SIGNAL(setImeEnble(bool)), m_webview, SLOT(setImeEnable(bool)));
}


#if 0
void ContainerWindow::safeClose()
{
    QElapsedTimer rtimer;
    rtimer.start();

    while(netmgrThread.isRunning())
    {
        netmgrThread.quit();
        netmgrThread.wait();
    }
    delete netChecker;

#ifdef ARM
    QSettings *ini = new QSettings("./config.ini",QSettings::IniFormat);
    QString tfcardPath = ini->value("/Operator/TFCardPath").toString();
    if (QDir("/").exists(tfcardPath))
    {
        //卸载TF卡
        system("sync");
        system((QString("umount -l %1").arg(tfcardPath)).toLatin1().data());
//        system((QString("rm -rf %1").arg(tfcardPath)).toLatin1().data());
    }
    QString udiskPath = ini->value("/Operator/UDiskPath").toString();
    if (QDir("/").exists(udiskPath))
    {
        //卸载U盘
        system("sync");
        system((QString("umount -f %1").arg(udiskPath)).toLatin1().data()); //
//        system((QString("rm -rf %1").arg(udiskPath)).toLatin1().data());
    }
#endif

    m_webview->load(QUrl(""));
    repaint();
    while(rtimer.elapsed()<100)
    {
        QCoreApplication::processEvents();
    }

    this->close();
}
#endif


void ContainerWindow::closeEvent(QCloseEvent *event)
{
    Q_UNUSED(event);
    setStyleSheet("background-color: #008080");     //实际不起作用，只是黑屏退出。加后延时会有效，但部分前景还在，很难看
    repaint();

    while(netmgrThread.isRunning())
    {
        netmgrThread.quit();
        netmgrThread.wait();
    }
    delete netChecker;

    devwrapper.closeServer();
    if (nodeProc != NULL)
    {
        nodeProc->terminate();      //在未启用webchannel向nodejs发terminae前，要用这个结束nodejs驻留
        nodeProc = NULL;
    }

#if 0
    QEventLoop loop;
    QTimer::singleShot(50, &loop, SLOT(quit()));
    loop.exec(QEventLoop::ExcludeUserInputEvents);
#endif
}

/*
void ContainerWindow::mousePressEvent(QMouseEvent *event)
{
    return QWidget::mousePressEvent(event);
}

void ContainerWindow::timerEvent(QTimerEvent *)
{
}
*/

void ContainerWindow::loadNodejsServer()
{
//#ifdef USE_LOCAL_WEBSERVER
    if (nodeProc != NULL)
        return;
    nodeProc = new QProcess();
    nodeProc->setProcessChannelMode(QProcess::SeparateChannels);   //stdout和stderr分开

    connect(nodeProc, static_cast<void(QProcess::*)(int, QProcess::ExitStatus)>(&QProcess::finished),
          [=](int exitCode, QProcess::ExitStatus exitStatus)    {
        Q_UNUSED(exitCode);
        Q_UNUSED(exitStatus);
        nodeProc = NULL;
    });
    connect(nodeProc, &QProcess::readyReadStandardOutput, this, [=]()   {
        while(nodeProc->canReadLine())
        {
            QByteArray buffer(nodeProc->readLine());
            qDebug()<<"nodejs:"<<QString(buffer);
        }
    });
    connect(nodeProc, &QProcess::readyReadStandardError, this, [=]()   {
        qDebug()<<"nodeErr:"<<QString(nodeProc->readAllStandardError());
    });


    QString workdir = QCoreApplication::applicationDirPath();
    workdir = workdir.left(workdir.indexOf('-'));       //去掉proj-build-pc的后段
    nodeProc->setWorkingDirectory(workdir);
    QStringList args;       //注意，args中String不能包含空格！
    args <<"wod-index.js";

#ifdef NODEJS_EMBED_PROC
    nodeProc->start(tr("node"), args);
    if (!nodeProc->waitForStarted(100))
    {
        QMessageBox::warning(this,tr("warning"), "QProcess启动nodejs失败");
        nodeProc = NULL;
    }
    qDebug()<<"run nodejs in Qt-process..";
#else
    if (!nodeProc->startDetached(tr("node"), args))     //Detach方式不能用waitForStarted()判断启动成功
    {
        QMessageBox::warning(this,tr("warning"), "QProcess启动nodejs失败");
        nodeProc = NULL;
    }
    qDebug()<<"run nodejs detached.";
#endif
//#endif
}
