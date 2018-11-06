# cockpit-ceph-installer
This project aims to provide a simple means to deploy a Ceph cluster by 'teaming up' with the ansible-runner and runner-service projects. The goal is to use the cockpit UI to gather all the settings necessary to drive a ceph-ansible playbook to install your Ceph cluster. It also uses the ceph-check-role ansible module to handle the validation of role against host configuration.

## Project Status
The plugin currently will 
- create the ansible inventory file (hosts and groups)
- probe and validate candidate hosts against their intended Ceph role
- presents available networks for the public and cluster networks required by Ceph

### What's left
1. The UI gathers the variables for ceph-ansible's site.yml, so these variables need to be committed to the filesystem
2. The deploy page needs to be completes to run the site.yml playbook and poll the runner-service for progress updates

## Try it Out

1. Setup up a Fedora 29 VM
  - As root run the following commands to install pre-requisite packages
```  
dnf install wget git cockpit-ws cockpit-bridge cockpit-system cockpit-dashboard ansible python python3-pyOpenSSL python3-jwt python3-flask python3-flask-restful
pip3 install ansible_runner 
```  
  - Enable the cockpit UI
```
systemctl enable --now cockpit.socket
```
  NB the install of python provides a python2 environment and sets up /usr/bin/python, which ceph-check-role uses

2. setup ssh access 
  - add multiple entries to /etc/hosts to represent hosts all pointing to 127.0.0.1
  - as root, create ssh keys (ssh-keygen) and copy to the first 'host', then check you can login without a password to all of these test hosts

3. runner-service
  - create a config dir (mkdir /etc/ansible-runner-service)
  - as root, cd ~
  - git clone https://github.com/pcuzner/ansible-runner-service.git
  - cd ansible-runner-service
  - python3 ansible_runner_service.py
  - ansible_runner_service will create a file called ```svctoken``` in the current directory. copy this file to ```/etc/ansible-runner-service``` (this is where cockpit expects to pick it up!)
  - under samples/project we need to place the check roles 'stuff'
  ```
    mkdir samples/project/library
    cd samples/project/library && wget https://raw.githubusercontent.com/pcuzner/ceph-check-role/master/library/ceph_check_role.py
    cd .. && wget https://raw.githubusercontent.com/pcuzner/ceph-check-role/master/checkrole.yml
  ```
    - the playbook from github provides defaults - we need to remove them, so the cockpit plugin can drive the checks. Update
      the checkrole.yml playbook as follows;
      - delete the vars definition (4 lines)
      - update the declarations for mode and deployment;
            mode: "{{ mode }}"
            deployment: "{{ deployment }}"

4. cockpit
- create cockpit directory in root's home folder
```
mkdir -p .local/share/cockpit
```
- grab the dist folder from the project
- add a symlink to the dist folder in your ceph-installer directory
```
cd /root/.local/share/cockpit
ln -s ~/ceph-installer/dist/ ceph-installer
```
- point your browser at port 9090 of the machine, and login as root
  - make sure runner-service has been started!

Gotcha's
1. if you see "Problem fetching group listnot-found" in the browsers console..
   - check that runner-service is running!


-----------------------------------------------------------------------------------------------------------------

Hack on it

To develop you need more than the dist and src - you'll need the cockpit dev environment.
More steps to come.

