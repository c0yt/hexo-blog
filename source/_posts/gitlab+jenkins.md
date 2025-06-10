---
title: Hexo 博客自动化部署与高可用架构设计
description: 本项目旨在通过 GitLab + Jenkins + Ansible 实现 Hexo 博客的一键自动化部署，并使用 Nginx + Keepalived 实现多节点高可用架构，提升部署效率和服务稳定性。
keywords: Gitlab,Jenkins,Ansible,CI/CD,笔记,运维
author: 'null'
cover: https://cdn.fzero.dpdns.org/img/2025/06/635a5ccd1eda82bdd5385d883d1b70cf.png
category:
  - Linux
tag:
  - Gitlab
  - Jenkins
  - Ansible
  - CI/CD
  - 笔记
  - 运维
abbrlink: 1
date: 2025-06-09 11:18:25
---

## 项目概述
本项目旨在通过 GitLab + Jenkins + Ansible 实现 Hexo 博客的一键自动化部署，并使用 Nginx + Keepalived 实现多节点高可用架构，提升部署效率和服务稳定性。

## 架构设计图  
```plsql
+-------------+          Git Push         +------------+
| Developer   |  ---------------------->  |  GitLab    |
+-------------+                           +------------+
                                                |
                                                | Webhook
                                                v
                                           +-----------+
                                           |  Jenkins  |
                                           +-----------+
                                                |
                                           调用 Ansible
                                                |
                                                v
                                     +---------------------+
                                     |  Web Server Cluster |
                                     |  (Nginx + Hexo)     |
                                     +---------------------+
                                        |              |
                                  Keepalived        Keepalived
                                     |                  |
                                +--------+        +--------+
                                | Master |        | Backup |
                                +--------+        +--------+

```

## 环境准备
### 1. 主机规划
| 主机名 | IP | 环境 | 角色 |
| --- | --- | --- | --- |
| gitlab | 192.168.100.116 | Ubuntu22.04 LTS / 4h4g | GitLab 18.0 |
| jenkins | 192.168.100.114 | Ubuntu22.04LTS / 2h2g | Jenkins 2.504.2 + Ansible |
| web01 | 192.168.100.110 | Centos7.9 / 1h1g | Nginx + Keepalived（主） |
| web02 | 192.168.100.112 | Centos7.9 /1h1g | Nginx + Keepalived（备） |


## 部署步骤
### 搭建 GitLab 仓库
<font style="color:rgb(35, 39, 47);">信任 GitLab 的 GPG 公钥</font>

```bash
curl -fsSL https://packages.gitlab.com/gpg.key | sudo gpg --dearmor -o /usr/share/keyrings/gitlab_gitlab-ce-archive-keyring.gpg
```

配置`/etc/apt/sources.list.d/gitlab-ce.list`

```bash
echo 'deb [signed-by=/usr/share/keyrings/gitlab_gitlab-ce-archive-keyring.gpg] https://mirrors.cernet.edu.cn/gitlab-ce/ubuntu jammy main
' | sudo tee /etc/apt/sources.list.d/gitlab-ce.list
```

<font style="color:rgb(35, 39, 47);">更新源并安装 gitlab-ce</font>

```bash
sudo apt-get update
sudo apt-get install gitlab-ce
```

> 镜像站参考配置：[https://help.mirrors.cernet.edu.cn/gitlab-ce/](https://help.mirrors.cernet.edu.cn/gitlab-ce/)
>

编辑配置文件/etc/gitlab/gitlab.rb，默认80端口未被占用可不修改，修改<font style="color:rgb(82, 82, 91);background-color:rgb(229, 231, 235);">external_url，nginx['listen_port']</font>

![](https://cdn.fzero.dpdns.org/img/2025/06/1a315241f5dd9ef60362041d138c279c.png)

加载配置，同时防火墙放行端口

```bash
sudo gitlab-ctl reconfigure
sudo gitlab-ctl restart
```

查看初始密码，默认用户名为root，密码将在24h后失效

```bash
cat /etc/gitlab/initial_root_password
```

### 搭建 Jenkins + Ansible 环境
安装jdk环境

> 这里以openjdk为例，实际最好编译安装java环境
>

```bash
sudo apt update
sudo apt install fontconfig openjdk-17-jre
```

检查安装情况

![](https://cdn.fzero.dpdns.org/img/2025/06/12e1f4a1a989512b0b364ac2d94b37b6.png)

添加jenkins官方仓库到包管理器

```bash
curl -fsSL https://pkg.jenkins.io/debian-stable/jenkins.io-2023.key | sudo tee /usr/share/keyrings/jenkins-keyring.asc > /dev/null
```

安装jenkins

```bash
sudo apt update
sudo apt install jenkins
```

查看安装情况

```bash
sudo systemctl status jenkins
```

![](https://cdn.fzero.dpdns.org/img/2025/06/1d69952fe72c1b8a77c9eb14962a1056.png)

配置开机自启动，并放行响应端口

```bash
sudo systemctl start jenkins
sudo systemctl enable jenkins
```

初次访问的时候会有个解锁密码

```bash
sudo cat /var/lib/jenkins/secrets/initialAdminPassword
```

安装Ansible

+ Ubuntu

```bash
sudo apt install ansible
```

![](https://cdn.fzero.dpdns.org/img/2025/06/152800c925105e099fba8021eb3c997c.png)

+ Centos

```bash
yum install -y epel-release	
yum install -y ansible
```

	![](https://cdn.fzero.dpdns.org/img/2025/06/d225716e0f9768e6ae66c93c1839287c.png)

### 配置 Anisble
#### 配置SSH免密连接
创建密钥对

![](https://cdn.fzero.dpdns.org/img/2025/06/079bbd049531bcfe64413dcb9fe21552.png)

分发公钥

```bash
ssh-copy-id sky@192.168.100.110
ssh-copy-id sky@192.168.100.112
```

![](https://cdn.fzero.dpdns.org/img/2025/06/d2004c264929877d9203eb2e7cd26d0b.png)

测试免密连接是否配置成功

![](https://cdn.fzero.dpdns.org/img/2025/06/12385871a8cfbb2d941e92fdf03557e1.png)

#### 目录结构设计
```yaml
ansible/
├── deploy_hexo.yml         # Hexo博客部署playbook
├── deploy_ha.yml           # 高可用架构部署playbook
├── jenkins-playbook.yml    # Jenkins调用的playbook
├── Jenkinsfile             # Jenkins流水线配置
├── inventory/
│   └── hosts               # 主机清单
├── group_vars/
│   └── web.yml             # Web服务器组变量
└── roles/
    ├── nginx/              # Nginx角色
    │   ├── tasks/
    │   │   └── main.yml    # Nginx任务
    │   ├── handlers/
    │   │   └── main.yml    # Nginx处理程序
    │   ├── templates/
    │   │   ├── nginx.conf.j2 # Nginx配置模板
    │   │   └── default.conf.j2 # 默认站点配置
    │   └── files/
    │       └── index.html  # 静态文件
    └── keepalived/         # Keepalived角色
        ├── tasks/
        │   └── main.yml    # Keepalived任务
        ├── handlers/
        │   └── main.yml    # Keepalived处理程序
        └── templates/
            ├── keepalived.conf.j2 # Keepalived配置模板
            └── check_nginx.sh.j2 # Nginx检查脚本
```

#### 配置主机清单
<font style="color:rgb(52, 73, 94);">在</font>`<font style="color:rgb(233, 105, 0);background-color:rgb(248, 248, 248);">inventory/hosts</font>`<font style="color:rgb(52, 73, 94);">文件中配置Web服务器组：</font>

```yaml
[web]
web01 ansible_host=192.168.100.110
web02 ansible_host=192.168.100.112

[all:vars]
ansible_user=root
ansible_connection=ssh
```

#### 配置Nginx角色
<font style="color:rgb(52, 73, 94);">Nginx角色通过Ansible自动化完成安装、配置和服务启动。主要任务包括：</font>

1. <font style="color:rgb(52, 73, 94);">添加Nginx官方仓库</font>
2. <font style="color:rgb(52, 73, 94);">安装Nginx</font>
3. <font style="color:rgb(52, 73, 94);">配置Nginx服务</font>
4. <font style="color:rgb(52, 73, 94);">启动并启用Nginx服务</font>
5. <font style="color:rgb(52, 73, 94);">配置防火墙规则</font>

编辑roles/nginx/handlers/main.yml

```yaml
---
- name: restart nginx
  systemd:
    name: nginx
    state: restarted

- name: reload firewalld
  systemd:
    name: firewalld
    state: reloaded 
```

编辑roles/nginx/tasks/main.yml

```yaml
---
# 添加Nginx官方仓库
- name: 添加Nginx仓库
  yum_repository:
    name: nginx
    description: nginx repo
    baseurl: http://nginx.org/packages/centos/7/$basearch/
    gpgcheck: no
    enabled: yes
  when: ansible_distribution == 'CentOS' and ansible_distribution_major_version == '7'

# 安装Nginx
- name: 安装Nginx
  yum:
    name: nginx
    state: present
  when: ansible_distribution == 'CentOS'

# 确保Nginx服务目录存在
- name: 确保Nginx配置目录存在
  file:
    path: /etc/nginx/conf.d
    state: directory
    mode: '0755'

# 复制Nginx配置文件
- name: 复制Nginx配置文件
  template:
    src: nginx.conf.j2
    dest: /etc/nginx/nginx.conf
    mode: '0644'
  notify: restart nginx

# 复制默认站点配置
- name: 复制默认站点配置
  template:
    src: default.conf.j2
    dest: /etc/nginx/conf.d/default.conf
    mode: '0644'
  notify: restart nginx

# 启用并启动Nginx服务
- name: 启用Nginx服务
  systemd:
    name: nginx
    enabled: yes
    state: started

# 开放防火墙端口
- name: 开放HTTP防火墙端口
  firewalld:
    port: 80/tcp
    permanent: yes
    state: enabled
  notify: reload firewalld
  when: ansible_distribution == 'CentOS'

```

配置roles/nginx/templates/default.conf.j2

```yaml
server {
    listen       80;
    server_name  localhost;
    error_log /var/log/nginx/blog_error.log notice;
    access_log /var/log/nginx/blog_access.log main;
    location / {
        root   /www/blog;
        index  index.html index.htm;
    }
} 
```

配置roles/nginx/templates/nginx.conf.j2

```yaml
user  nginx;
worker_processes  auto;

error_log  /var/log/nginx/error.log notice;
pid        /var/run/nginx.pid;

events {
    worker_connections  1024;
}

http {
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;

    log_format  main  '$remote_addr - $remote_user [$time_local] "$request" '
                      '$status $body_bytes_sent "$http_referer" '
                      '"$http_user_agent" "$http_x_forwarded_for"';

    access_log  /var/log/nginx/access.log  main;
    sendfile        on;
    keepalive_timeout  65;
    include /etc/nginx/conf.d/*.conf;
} 
```

#### <font style="color:rgb(44, 62, 80);">配置Keepalived角色</font>
<font style="color:rgb(52, 73, 94);">Keepalived角色实现Web服务器的高可用配置，主要任务包括：</font>

1. <font style="color:rgb(52, 73, 94);">安装Keepalived</font>
2. <font style="color:rgb(52, 73, 94);">配置Keepalived服务</font>
3. <font style="color:rgb(52, 73, 94);">配置Nginx服务监控脚本</font>
4. <font style="color:rgb(52, 73, 94);">配置虚拟IP</font>
5. <font style="color:rgb(52, 73, 94);">启动并启用Keepalived服务</font>

编辑roles/keepalived/handlers/main.yml

```yaml
---
- name: restart keepalived
  systemd:
    name: keepalived
    state: restarted 
```

编辑roles/keepalived/tasks/main.yml

```yaml
---
# 安装Keepalived
- name: 安装Keepalived
  yum:
    name: keepalived
    state: present
  when: ansible_distribution == 'CentOS'

# 创建检查脚本目录
- name: 创建检查脚本目录
  file:
    path: /etc/keepalived/scripts
    state: directory
    mode: '0755'

# 复制Nginx检查脚本
- name: 复制Nginx检查脚本
  template:
    src: check_nginx.sh.j2
    dest: /etc/keepalived/scripts/check_nginx.sh
    mode: '0755'

# 配置Keepalived
- name: 配置Keepalived
  template:
    src: keepalived.conf.j2
    dest: /etc/keepalived/keepalived.conf
    mode: '0644'
  notify: restart keepalived

# 启用并启动Keepalived服务
- name: 启用Keepalived服务
  systemd:
    name: keepalived
    enabled: yes
    state: started 
```

编辑roles/keepalived/templates/check_nginx.sh.j2

```yaml
#!/bin/bash
# 检查Nginx是否运行

/usr/bin/systemctl status nginx | grep -q 'active (running)'

if [ $? -ne 0 ]; then
    /usr/bin/systemctl restart nginx
    # 如果无法重启，则退出keepalived
    sleep 2
    /usr/bin/systemctl status nginx | grep -q 'active (running)'
    if [ $? -ne 0 ]; then
        /usr/bin/systemctl stop keepalived
    fi
fi 
```

编辑roles/keepalived/templates/keepalived.conf.j2

```yaml
global_defs {
    router_id {{ inventory_hostname }}
    script_user root
    enable_script_security
}

vrrp_script check_nginx {
    script "/etc/keepalived/scripts/check_nginx.sh"
    interval 3
    weight -2
    fall 2
    rise 1
}

vrrp_instance VI_1 {
    {% if inventory_hostname == 'web01' %}
    state MASTER
    priority 100
    {% else %}
    state BACKUP
    priority 90
    {% endif %}
    interface eth0
    virtual_router_id 51
    advert_int 1
    authentication {
        auth_type PASS
        auth_pass hexo_blog
    }
    virtual_ipaddress {
        192.168.100.120/24
    }
    track_script {
        check_nginx
    }
} 
```

#### 编写部署Hexo博客 playbook
编辑deploy_hexo.yml

```yaml
---
- name: 部署Hexo博客
  hosts: web
  become: yes
  vars:
    hexo_blog_path: /www/blog
    
  roles:
    - nginx

  tasks:
    - name: 创建Hexo博客目录
      file:
        path: "{{ hexo_blog_path }}"
        state: directory
        mode: '0755'
      
    - name: 清空原有博客内容
      shell: "rm -rf {{ hexo_blog_path }}/*"
      args:
        warn: false
        
    - name: 复制Hexo博客内容
      copy:
        src: "{{ hexo_blog_content_dir }}/"
        dest: "{{ hexo_blog_path }}"
        mode: '0644'
        directory_mode: '0755'
      when: hexo_blog_content_dir is defined 
```

#### 编写部署Keepalived高可用 playbook
```yaml
---
- name: 配置高可用Web服务器
  hosts: web
  become: yes
  
  roles:
    - keepalived
    
  tasks:
    - name: 确保防火墙允许Keepalived VRRP协议
      firewalld:
        rich_rule: 'rule protocol value="vrrp" accept'
        permanent: yes
        state: enabled
      notify: reload firewalld
      when: ansible_distribution == 'CentOS'
      
  handlers:
    - name: reload firewalld
      systemd:
        name: firewalld
        state: reloaded 
```

#### 编写Jenkins playbook
```yaml
---
- name: Jenkins调用的Hexo部署任务
  hosts: web
  become: yes
  vars:
    hexo_blog_path: /www/blog
    hexo_blog_content_dir: "{{ jenkins_workspace }}/public"
    
  roles:
    - nginx
    
  tasks:
    - name: 创建Hexo博客目录
      file:
        path: "{{ hexo_blog_path }}"
        state: directory
        mode: '0755'
      
    - name: 清空原有博客内容
      shell: "rm -rf {{ hexo_blog_path }}/*"
      args:
        warn: false
        
    - name: 复制Hexo博客内容
      copy:
        src: "{{ hexo_blog_content_dir }}/"
        dest: "{{ hexo_blog_path }}"
        mode: '0644'
        directory_mode: '0755'
      when: hexo_blog_content_dir is defined 
```

### 配置Gitlab
#### 创建项目
![](https://cdn.fzero.dpdns.org/img/2025/06/b552bcdf13b9b749240931f67a492b4f.png)

#### 推送本地项目
创建SSH密钥对

```yaml
ssh-keygen -t rsa
```

复制id_rsa.pub文件的内容，配置Gitlab SSH密钥

![](https://cdn.fzero.dpdns.org/img/2025/06/b5f4e229e4669bcca3ff0cb4180f7297.png)

初始化项目并推送到Gitlab仓库

```yaml
git init
git add .
git switch --create main
git commit -m "Initial commit"
git remote add origin http://192.168.100.116:1080/root/hexo-blog.git
git push -u origin main
```

![](https://cdn.fzero.dpdns.org/img/2025/06/151618b29dc533b753bb851d6dc9003b.png)

#### 配置Jenkins公钥
![](https://cdn.fzero.dpdns.org/img/2025/06/a07bbc0f546fca0552f4ae13f9c11835.png)

#### 配置Webhooks
在Jenkins查看触发器配置，复制url，生成token

![](https://cdn.fzero.dpdns.org/img/2025/06/7fae9ffbe03e3830039a2e7ebd336715.png)

配置url，token，勾选推送事件，合并请求事件

![](https://cdn.fzero.dpdns.org/img/2025/06/5f4f802f389a026254576ff64ee9fae3.jpeg)

关闭SSL认证（本地测试）

![](https://cdn.fzero.dpdns.org/img/2025/06/3153f06fefc81c9a0b0b365b85467410.png)

勾选允许本地网络请求

![](https://cdn.fzero.dpdns.org/img/2025/06/a9af36f832aac62b04977f1faf7f598c.png)

### 配置Jenkins
#### 配置用户凭证
##### 配置Jenkins的私钥
![](https://cdn.fzero.dpdns.org/img/2025/06/84283dd02014b761cd18012c21efd920.png)

##### 配置Gitlab凭证
![](https://cdn.fzero.dpdns.org/img/2025/06/31eff50ce31b58af883c87e9f0a28307.png)

配置成果如下：

![](https://cdn.fzero.dpdns.org/img/2025/06/fe775605105884e02e99509b3e4497c0.png)

#### 配置 NodeJS
安装完相应的插件，配置NodeJS，别名取成node

![](https://cdn.fzero.dpdns.org/img/2025/06/a38fb358b48a401ce29dbafa4fa92d25.png)

新建流水线项目

![](https://cdn.fzero.dpdns.org/img/2025/06/c1d87f03befd35c521d5a9faf0eb89cd.png)

#### 配置触发器
勾选图示选项

![](https://cdn.fzero.dpdns.org/img/2025/06/d278b7844cf25988550e7aa9020b1f59.png)



#### 配置流水线
![](https://cdn.fzero.dpdns.org/img/2025/06/c80e7a8dc5fd17b3d51e6088180ecd9c.png)

编辑Jenkinsfile，需要放在网站源码的根目录

```yaml
pipeline {
    agent any
    
    tools {
        nodejs "node"
    }
    
    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }
        
        stage('Install Dependencies') {
            steps {
                sh 'npm install'
                sh 'npm install hexo-cli -g'
            }
        }
        
        stage('Build') {
            steps {
                sh 'hexo clean && hexo generate'
            }
        }
        
        stage('Deploy') {
            steps {
                script {
                    def workspace = env.WORKSPACE
                    sh "ansible-playbook -i /etc/ansible/inventory/hosts /etc/ansible/jenkins-playbook.yml -e 'jenkins_workspace=${workspace}'"
                    sh "ansible-playbook -i /etc/ansible/inventory/hosts /etc/ansible/deploy_ha.yml"
                }
            }
        }
    }
    
    post {
        success {
            echo '部署成功!'
        }
        failure {
            echo '部署失败，请检查日志!'
        }
    }
} 
```

## 部署 & 测试
推送事件测试

![](https://cdn.fzero.dpdns.org/img/2025/06/5545c0460f0abffac21efe14e15a7eb3.png)

状态码返回200

![](https://cdn.fzero.dpdns.org/img/2025/06/c0899604530f2113605ff399c3e41c1d.png)

Jenkins出现新的构建

![](https://cdn.fzero.dpdns.org/img/2025/06/4ac365324b5747a29555e0ff7044a673.png)

部署成功

![](https://cdn.fzero.dpdns.org/img/2025/06/767a3a8c037d6aa73ae52f54cd70a5f5.png)

访问网站测试，状态码均200，正常

![](https://cdn.fzero.dpdns.org/img/2025/06/4ca3af5cce40797945ea07e1e43b259b.png)

