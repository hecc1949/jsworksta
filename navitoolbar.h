#ifndef NAVITOOLBAR_H
#define NAVITOOLBAR_H

#include <QApplication>
#include <QToolBar>
#include <QLineEdit>
#include <QLabel>
#include <QPushButton>

class NaviToolBar : public QToolBar
{
    Q_OBJECT
public:
    explicit NaviToolBar(QWidget *parent = nullptr);
//    NaviToolBar(QWidget *parent = nullptr);

    void naviActionEnable(int indexMode, bool enable=false);
    void naviChangeRefreshIcon(bool refreshMode);
    void setUrlLine(QString urlStr);

    void setAutoShow(int time_ms);
protected:
    void timerEvent(QTimerEvent *);

signals:
    void navigationAction(int indexMode);
    void urlInput(QString urlStr);

private:
    QAction *m_backAction;
    QAction *m_forwardAction;
    QAction *m_refreshAction;
    QIcon iconStop;
    QIcon iconRefresh;

    QLineEdit *m_urlLineEdit;
    QLabel *_emptyLabel;
//    QPushButton *m_closeButton;
    QAction *m_closeAction;
    int _timerId = -1;
};

#endif // NAVITOOLBAR_H
