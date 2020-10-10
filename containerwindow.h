#ifndef CONTAINERWINDOW_H
#define CONTAINERWINDOW_H

#include <QMainWindow>
#include "tinytitlebar.h"
#include "navitoolbar.h"
#include "websinglepageview.h"


namespace Ui {
class ContainerWindow;
}

class ContainerWindow : public QMainWindow
{
    Q_OBJECT

public:
    explicit ContainerWindow(QWidget *parent = 0);
    ~ContainerWindow();

    NaviToolBar *naviToolBar;
    void loadEmptyView();

protected:
    void closeEvent(QCloseEvent *event);
//    void timerEvent(QTimerEvent *);     //使用QObject内置Timer
//    void mousePressEvent(QMouseEvent *event);

/*
    QVariant inputMethodQuery(Qt::InputMethodQuery query) const override
    {
        if (Qt::ImEnabled == query)
              return false;
        return QMainWindow::inputMethodQuery(query);
    }
*/

private:
    Ui::ContainerWindow *ui;
//    QLabel *statusLabelA;
//    int _timerId;
    WebSinglePageView *m_webview;
    void setupFace();
private slots:
    void onNaviEnabledChanged(QWebEnginePage::WebAction act, bool enabled);
    void onWebProgress(int progress);

    void onNaviAction(int indexMode);

};

#endif // CONTAINERWINDOW_H
