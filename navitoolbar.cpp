#include "navitoolbar.h"
#include <QHBoxLayout>

NaviToolBar::NaviToolBar(QWidget *parent)
    : QToolBar(parent)
{
    QLayout* layout = this->layout();
    layout->setContentsMargins(4, 2, 4, 2);     //不起作用?
    layout->setSpacing(4);      //这样可以勉强对本身的layout作一些修改

    setFixedHeight(32);
    setMovable(false);
    toggleViewAction()->setEnabled(false);

    m_backAction = new QAction(this);
    m_backAction->setIcon(QIcon(QStringLiteral(":/res/go-previous.png")));
    m_backAction->setToolTip(tr("向后"));
    addAction(m_backAction);
    connect(m_backAction, &QAction::triggered, [this]() {   emit navigationAction(-1);  });

    m_forwardAction = new QAction(this);
    m_forwardAction->setIcon(QIcon(QStringLiteral(":/res/go-next.png")));
    m_forwardAction->setToolTip(tr("向前"));
    addAction(m_forwardAction);
    connect(m_forwardAction, &QAction::triggered, [this]() {   emit navigationAction(1);  });

    m_refreshAction = new QAction(this);
    iconStop = QIcon(QStringLiteral(":/res/process-stop.png"));
    iconRefresh = QIcon(QStringLiteral(":/res/view-refresh.png"));
    m_refreshAction->setIcon(iconRefresh);

    m_refreshAction->setToolTip(tr("刷新"));
    addAction(m_refreshAction);
    connect(m_refreshAction, &QAction::triggered, [this]() {   emit navigationAction(0);  });

    m_backAction->setEnabled(false);
    m_forwardAction->setEnabled(false);

    m_urlLineEdit = new QLineEdit(this);
    m_urlLineEdit->setClearButtonEnabled(true);
    addWidget(m_urlLineEdit);
    connect(m_urlLineEdit, &QLineEdit::returnPressed, [this]() {
        emit urlInput(m_urlLineEdit->text());
    });

    addSeparator();
    _emptyLabel = new QLabel(this);
    _emptyLabel->setMinimumWidth(250);
    addWidget(_emptyLabel);
    addSeparator();

    auto m_closeAction = new QAction(this);
    m_closeAction->setIcon(QIcon(QStringLiteral(":/res/close.png")));
    m_closeAction->setToolTip(tr("关机退出"));
    addAction(m_closeAction);
    connect(m_closeAction, &QAction::triggered, [=]() {  parent->close();});

    addSeparator();
}

void NaviToolBar::naviActionEnable(int indexMode, bool enable)
{
    if (indexMode == -1)
        m_backAction->setEnabled(enable);
    else if (indexMode == 1)
        m_forwardAction->setEnabled(enable);
    else if (indexMode == 0)
    {
        m_refreshAction->toggle();
    }
}

void NaviToolBar::naviChangeRefreshIcon(bool refreshMode)
{
    if (refreshMode)
    {
        m_refreshAction->setData(1);
        m_refreshAction->setIcon(iconRefresh);
        m_refreshAction->setToolTip(tr("刷新"));
    }
    else
    {
        m_refreshAction->setData(0);
        m_refreshAction->setIcon(iconStop);
        m_refreshAction->setToolTip(tr("停止"));
    }
}

void NaviToolBar::setUrlLine(QString urlStr)
{
    m_urlLineEdit->setText(urlStr);
}

void NaviToolBar::timerEvent(QTimerEvent *event)
{
    hide();
    killTimer(event->timerId());
    _timerId = -1;
}

void NaviToolBar::setAutoShow(int time_ms)
{
    if (time_ms <=0)
    {
        show();
        if (_timerId>=0)
            killTimer(_timerId);
    }
    else if (_timerId<0)
    {
        if (isHidden())
            show();
        _timerId = startTimer(time_ms);
    }
}

