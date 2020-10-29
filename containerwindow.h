#ifndef CONTAINERWINDOW_H
#define CONTAINERWINDOW_H

#include <QMainWindow>
//#include "tinytitlebar.h"
#include "navitoolbar.h"
#include "websinglepageview.h"
#include "networkchecker.h"

namespace Ui {
class ContainerWindow;
}

class ContainerWindow : public QMainWindow
{
    Q_OBJECT

public:
    explicit ContainerWindow(QWidget *parent = 0);
    ~ContainerWindow();

    QThread netmgrThread;
    NetworkChecker *netChecker;
    NetworkInfo_t m_netInfo;

    NaviToolBar *naviToolBar;
    void safeClose();
protected:
    void closeEvent(QCloseEvent *event);
//    void timerEvent(QTimerEvent *);     //使用QObject内置Timer
//    void mousePressEvent(QMouseEvent *event);


private:
    Ui::ContainerWindow *ui;
//    int _timerId;
    WebSinglePageView *m_webview;
    void setupFace();
//    void loadEmptyView();
private slots:
    void onNaviEnabledChanged(QWebEnginePage::WebAction act, bool enabled);
    void onWebProgress(int progress);

    void onNaviAction(int indexMode);
    void onNetworkStatusUpdate(NetworkInfo_t);
};

#endif // CONTAINERWINDOW_H
