# cockpit-ceph-installer
This project aims to provide a simple means to deploy a Ceph cluster by 'teaming up' with the ansible-runner and runner-service projects. The goal is to use the cockpit UI to gather all the settings necessary to drive a ceph-ansible playbook to install your Ceph cluster. It also uses the ceph-check-role ansible module to handle the validation of role against host configuration.

## Project Status
The plugin currently 
- creates the ansible inventory file (hosts and groups)
- supports different ceph versions, bluestore and filestore, encrypted/non-encrypted
- for a Nautilus target, a metrics hosts is required for full prometheus/grafana support  
- probes and validates candidate hosts against their intended Ceph role(s)
- presents ans selects available networks for the public, cluster and S3 networks
- provides a review of the selections made
- configuration options selected are committed to standard yml format ansible files (host & group vars)
- initiates the ceph-ansible playbook and monitor progress
- any deployment errors are shown in the UI
- following a Nautilus based deployment, the user may click a link to go straight to Ceph's web management console
- allows environment defaults to be overridden from `var/lib/cockpit/ceph-installer/defaults.json`  
- supported roles: mons (inc mgrs), mds, osds, rgws and iscsi gateways

## Curious, take a look...

[![demo](screenshots/ceph-installer-2019-04.gif)](https://youtu.be/wIw7RjHPhzs)

## Take it for a testdrive
### 1. Create a test VM
#### **Fedora 29** *(example uses a cloud qcow2 image)* ####
  1. As root run the following commands to install pre-requisite packages
```bash
dnf install -y wget git cockpit-ws cockpit-bridge cockpit-system cockpit-dashboard ansible python python3-pyOpenSSL python3-jwt python3-flask python3-flask-restful
pip3 install ansible_runner
```

#### **RHEL7** *(example uses a RHEL7.6 cloud image)*   ####
1. Enable the following CDN repos *(ose 3.9 required for python-jwt)*
```
subscription-manager repos --enable=rhel-7-server-rpms --enable=rhel-7-server-extras-rpms --enable=rhel-7-server-optional-rpms --enable=rhel-7-server-ansible-2-rpms --enable=rhel-7-server-ose-3.9-rpms
```  

  2. Install pre-requisite packages
```
yum install -y
    ansible  
    pyOpenSSL  
    python-jwt  
    git  
    unzip  
    wget  
    python2-flask-restful  
    python2-pip (for up to date runner install)  
    python2-docutils  
pip install ansible_runner
pip install flask
pip install flask_restful  
```
#### **RHEL8 beta/base repo**
1. RPM installs for the following packages
```
python3-flask  
python3-pyOpenSSL  
python3-jwt
python3-pip
cockpit-ws  
cockpit-system  
cockpit-dashboard  
cockpit-bridge  
gcc  
redhat-rpm-config  
python36  
platform-python-devel
```
2. Install ansible and ansible_runner
```
pip3.6 install ansible
pip3.6 install ansible_runner
```
3. Use ```alternatives --config python``` to ensure /usr/bin/python is present (needed by the ceph-check-role module)

### 2. Enable the cockpit interface
```
systemctl enable --now cockpit.socket  
```
NB the install of python provides a python2 environment and sets up /usr/bin/python, which ceph-check-role uses

### 3. Install the ansible-runner-service  

  1. create a config dir (```mkdir /etc/ansible-runner-service```)
  2. As root, 
  ```
  cd ~
  git clone https://github.com/pcuzner/ansible-runner-service.git
  cd ansible-runner-service
  python ansible_runner_service.py
  ```
  3. ansible_runner_service will create a file called ```svctoken``` in the current directory. copy this file to ```/etc/ansible-runner-service``` (this is where cockpit expects to pick it up!)
  4. install the checkrole playbook and module
  ```
    mkdir samples/project/library
    cd samples/project/library && wget https://raw.githubusercontent.com/pcuzner/ceph-check-role/master/library/ceph_check_role.py
    cd .. && wget https://raw.githubusercontent.com/pcuzner/ceph-check-role/master/checkrole.yml
  ```
  5. Update the playbook (the defaults need to be removed so the cockpit plugin can drive the checks). Update the ```checkrole.yml``` playbook as follows;
  - delete the vars definition (4 lines)
  - update the declarations for mode and deployment;  
  ```
          mode: "{{ mode }}"  
          deployment: "{{ deployment }}"  
  ```

### 4. Define some example ssh access

  - add multiple entries to /etc/hosts to represent hosts all pointing to 127.0.0.1
  - runner-service will create ssh keys in samples/env. Use ```ssh-copy-id -f -i ssh_key.pub root@<host>``` to copy the public key to your test hosts.

### 5. Deploy the cockpit plugin

1. create cockpit directory in root's home folder
```
cd ~
mkdir -p .local/share/cockpit
```
2. grab the dist folder from the project
3. add a symlink to the dist folder in your ceph-installer directory
```
cd /root/.local/share/cockpit
ln -s ~/ceph-installer/dist/ ceph-installer
```
4. point your browser at port 9090 of the machine, and login as root
   - make sure runner-service has been started - if not, the UI will tell you!


-----------------------------------------------------------------------------------------------------------------

## Hack on it

To hack on the UI plugin, you'll need a nodejs install. I'm using the latest stable (10.x) version.

1. Install nodejs
```
yum install -y gcc-c++ make  
curl -sL https://rpm.nodesource.com/setup_10.x | sudo -E bash -  
yum install -y nodejs
```

2. The project repo provides a package.json (for webpack) and babel config, so to build the plugin files just run  
```
# make 
```

3. Link your dist directory to one that cockpit will use. By default cockpit will look in the ```~/.local/share/cockpit``` directory for 
user specific plugins - so this is where we want to place a symlink.
```
cd ~
mkdir -p .local/share/cockpit
ln -s <dist directory> ceph-installer
```

With this link in place, whenever you run ```make``` the dist files will be regenerated and cockpit will see updated code (well, after you refresh the browser!)  

Nice and simple - thanks to the cockpit devs! The starter kit can be found [here](https://github.com/cockpit-project/starter-kit)