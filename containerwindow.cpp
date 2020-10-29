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
    ui(new Ui::ContainerWindow)
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
    setupFace();

    //网络检测
    m_netInfo.netStatus = 0;
    netChecker = new NetworkChecker(NULL);          //手工delete
    connect(netChecker, SIGNAL(sigCheckNetDone(NetworkInfo_t)), this, SLOT(onNetworkStatusUpdate(NetworkInfo_t)));
    netChecker->moveToThread(&netmgrThread);
    netmgrThread.start();

    QTimer *startAppTimer = new QTimer(this);
    startAppTimer->setSingleShot(true);
    connect(startAppTimer, &QTimer::timeout, this,[=]() {
        netChecker->checkNetworkStatus();
    });
//    qDebug()<<"main thread:"<<QThread::currentThread();
    startAppTimer->start(2000);

}

ContainerWindow::~ContainerWindow()
{
    delete ui;
}

void ContainerWindow::setupFace()
{
    naviToolBar = new NaviToolBar(this);
    addToolBar(naviToolBar);
    connect(naviToolBar, SIGNAL(navigationAction(int)), this, SLOT(onNaviAction(int)));
    connect(naviToolBar,&NaviToolBar::urlInput, [this](QString urlStr)  {
        m_webview->setUrl(QUrl::fromUserInput(urlStr));
    });

    m_webview = new WebSinglePageView(this);
    WebPage *page = new WebPage(QWebEngineProfile::defaultProfile(), m_webview);
    m_webview->setPage(page);

    QString htmlPath = QCoreApplication::applicationDirPath() + "/URfidwritor.html";
    m_webview->load(QUrl("file://"+htmlPath));
//    m_webview->setUrl(QUrl(QStringLiteral("http://163.com")));

    connect(m_webview, SIGNAL(loadProgressStatus(int)), this, SLOT(onWebProgress(int)));
    connect(m_webview, SIGNAL(naviActionChanged(QWebEnginePage::WebAction, bool)),
            this, SLOT(onNaviEnabledChanged(QWebEnginePage::WebAction, bool)));

    connect(m_webview, &QWebEngineView::urlChanged,[this](const QUrl &url) {
        naviToolBar->setUrlLine(url.toString());
    });

    setCentralWidget(m_webview);

    ui->statusBar->hide();
    naviToolBar->hide();
}

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

    m_webview->load(QUrl(""));
    repaint();
    while(rtimer.elapsed()<100)
    {
        QCoreApplication::processEvents();
    }

//    qDebug()<<"application terminate.";
    this->close();
}


void ContainerWindow::closeEvent(QCloseEvent *event)
{
    Q_UNUSED(event);
    setStyleSheet("background-color: #008080");     //实际不起作用，只是黑屏退出。加后延时会有效，但部分前景还在，很难看
    repaint();
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

void ContainerWindow::onNaviEnabledChanged(QWebEnginePage::WebAction act, bool enabled)
{
    switch (act) {
        case QWebEnginePage::Back:
            naviToolBar->naviActionEnable(-1, enabled);
            break;
        case QWebEnginePage::Forward:
            naviToolBar->naviActionEnable(1, enabled);
            break;
        default:
            break;
    }

}

void ContainerWindow::onWebProgress(int progress)
{
    if (progress>0 && progress<100)
    {
        naviToolBar->naviChangeRefreshIcon(false);
    }
    else
    {
        naviToolBar->naviChangeRefreshIcon(true);
    }
}

void ContainerWindow::onNaviAction(int indexMode)
{
    if (indexMode == -1)
    {
        m_webview->triggerPageAction(QWebEnginePage::Back);
    }
    else if (indexMode == 1)
    {
        m_webview->triggerPageAction(QWebEnginePage::Forward);
    }
}

void ContainerWindow::onNetworkStatusUpdate(NetworkInfo_t netInfo)
{
    m_netInfo = netInfo;
}
