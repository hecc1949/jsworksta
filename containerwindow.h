#ifndef CONTAINERWINDOW_H
#define CONTAINERWINDOW_H

#include <QMainWindow>
//#include "tinytitlebar.h"
//#include "navitoolbar.h"
#include "localtoolbar.h"
#include "websinglepageview.h"
#include "networkchecker.h"
#include "websocketchannel.h"
#include "urfidwrapper.h"

#define USE_LOCAL_WEBSERVER

#ifndef ARM
//nodejs在QT进程中运行。这时能确保js的console.log()以qDebug()输出，方便调试，但system()相关程序不能工作, 正式应用的
//程序不能用这个
#define     NODEJS_EMBED_PROC
#endif

namespace Ui {
class ContainerWindow;
}

class ContainerWindow : public QMainWindow
{
    Q_OBJECT

public:
    explicit ContainerWindow(QWidget *parent = 0);
    ~ContainerWindow();
    void closeWebPage() {
        m_webview->close();
    }

    QThread netmgrThread;
    NetworkChecker *netChecker;
    NetworkInfo_t m_netInfo;

    LocalToolBar *localTools;
    QString m_tfcardPath;
    QString m_udiskPath;

//    NaviToolBar *naviToolBar;
//    void safeClose();
protected:
    void closeEvent(QCloseEvent *event);
//    void timerEvent(QTimerEvent *);     //使用QObject内置Timer
//    void mousePressEvent(QMouseEvent *event);


private:
    Ui::ContainerWindow *ui;

    QFileSystemWatcher fsWatcher;

    WebsocketChannel wschannel;
    URfidWrapper devwrapper;

//    int _timerId;
    WebSinglePageView *m_webview;
    QProcess *nodeProc = NULL;

//    void setupFace();
    void loadWebView();
    void loadNodejsServer();

private slots:
/*    void onNaviEnabledChanged(QWebEnginePage::WebAction act, bool enabled);
    void onWebProgress(int progress);
    void onNaviAction(int indexMode);
    void onNetworkStatusUpdate(NetworkInfo_t);
*/

};

#endif // CONTAINERWINDOW_H
