#ifndef NETCHECKER_H
#define NETCHECKER_H

#include <QObject>

class NetChecker : public QObject
{
    Q_OBJECT
public:
    explicit NetChecker(QObject *parent = nullptr);

signals:

public slots:
};

#endif // NETCHECKER_H
