---
title: Nginx
description:  本文详细介绍了Nginx的基本使用
keywords: 'Nginx,Linux,运维'
author: 'null'
cover: https://s21.ax1x.com/2025/04/24/pEo9FxJ.png
category:
  - Linux
  - Nginx
tag:
  - Linux
  - 笔记
  - Nginx
  - 运维
abbrlink: 9355
date: 2025-04-24 08:18:23
---

## 简介

​	[Nginx](https://nginx.org/en/) 是一款面向性能设计的 HTTP 服务器，能反向代理 HTTP、HTTPS 和邮件相关（SMTP、POP3、IMAP）的协议链接，并且提供了负载均衡以及 HTTP 缓存。它的设计充分使用异步事件模型，削减上下文调度的开销，提高服务器并发能力。采用了模块化设计，提供了丰富的第三方模块。

## 安装

{% tabs install %}
<!-- tab yum安装 -->

配置nginx源

```bash
rpm -ivh http://nginx.org/packages/centos/7/noarch/RPMS/nginx-release-centos-7-0.el7.ngx.noarch.rpm
```

安装nginx

```
yum install -y nginx
```

测试并访问IP:80

```bash
[root@web sky]$nginx -v
nginx version: nginx/1.24.0
```

![验证图](https://s21.ax1x.com/2025/04/24/pEo9FxJ.png)

> 如有防火墙，可关闭防火墙或放行端口再重试
>
> yum安装默认适配systemctl服务管理

<!-- endtab -->

<!-- tab 编译安装 -->

安装依赖

```bash
yum install -y pcre-devel
yum -y install gcc make gcc-c++ wget
yum -y install openssl openssl-devel
yum install -y zlib zlib-devel
```

创建安装目录

```bash
mkdir -p /usr/local/nginx
```

进入[官网](https://nginx.org/en/download.html)选择对应的版本下载并解压到相应目录，本文以1.24版本为例

```bash
wget https://nginx.org/download/nginx-1.24.0.tar.gz
```

解压并进入目录

```bash
cd /usr/local/nginx/
tar -zxvf nginx-1.24.0.tar.gz
cd nginx-1.24.0/
```

编译安装

```bash
./configure --with-http_ssl_module --prefix=/usr/local/nginx
make && make install
```

> 执行./configure可能会报错，报错可以自行安装依赖解决
>
> `--prefix`可自行设置安装目录，`--with-http_ssl_module`让nginx支持https功能，非需要可不安装，其他选项自行定制

测试安装情况

```bash
cd /usr/local/nginx/sbin/
./nginx -v
```

为方便使用，建议添加环境变量，并添加以下内容

```bash
vim /etc/profile
```

```bash
PATH=$PATH:$HOME/bin:/usr/local/nginx/sbin/
export PATH
```

```bash
source /etc/profile
```

测试全局变量是否生效

```bash
nginx -v
```

配置systemctl方式管理

```
vim /usr/lib/systemd/system/nginx.service
```

加入以下内容

```bash
[Unit]
Description=nginx - high performance web server
Documentation=http://nginx.org/en/docs/
After=network-online.target remote-fs.target nss-lookup.target
Wants=network-online.target

[Service]
Type=forking
PIDFile=/usr/local/nginx/logs/nginx.pid
ExecStart=/usr/local/nginx/sbin/nginx -c /usr/local/nginx/conf/nginx.conf
ExecReload=/bin/kill -s HUP $MAINPID
ExecStop=/bin/kill -s TERM $MAINPID

[Install]
WantedBy=multi-user.target
```

设置开机自启动

```bash
systemctl enable nginx.service
```

关闭nginx

```bash
nginx -s stop
```

重新加载配置文件并启动

```
systemctl daemon-reload
systemctl start nginx
```

测试服务是否正常

![image-20250424084047300](https://s21.ax1x.com/2025/04/24/pEo9KPO.png)

<!-- endtab -->
{% endtabs %}

## 服务管理

常见命令：

- 启动nginx

```bash
nginx
```

- 重新加载配置

```bash
nginx -s reload
```

- 检查nginx配置是否正常

```bash
nginx -t
```

- 关闭nginx

```bash
nginx -s stop
```

## 基本使用

暂时略，后续补充

## 参考资料

https://wangchujiang.com/nginx-tutorial/

https://blog.csdn.net/weixin_42506599/article/details/104241721