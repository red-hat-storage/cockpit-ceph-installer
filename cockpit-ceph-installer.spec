Name: ceph-installer
Version: 0.8
Release: 6%{?dist}
Summary: Cockpit plugin for Ceph cluster installation
License: LGPLv2+

Source: ceph-installer-%{version}.tar.gz
BuildArch: noarch

Requires: ansible-runner-service >= 0.9
Requires: ceph-ansible >= 3.1
Requires: cockpit 
Requires: cockpit-bridge

%description
This package installs a plugin for cockpit that provides a a graphical means of installing a Ceph cluster. The plugin handles UI interaction and makes API calls to the ansible-runner-service API daemon, running on localhost, to run Ansible playbooks to handle the installation.


%prep
%setup -q -n ceph-installer-%{version}

%install
mkdir -p %{buildroot}%{_datadir}/cockpit/%{name}
install -m 0644 dist/* %{buildroot}%{_datadir}/cockpit/%{name}/
mkdir -p %{buildroot}%{_datadir}/metainfo/
install -m 0644 ./org.cockpit-project.%{name}.metainfo.xml %{buildroot}%{_datadir}/metainfo/

%post
if [ "$1" = 1 ]; then
  systemctl enable --now cockpit.service
# rename the project folder, and symlink to ceph-ansible
  mv %{_datadir}/ansible-runner-service/project %{_datadir}/ansible-runner-service/project_default
  ln -s /usr/share/ceph-ansible %{_datadir}/ansible-runner-service/project

# copy the sample playbooks for installation, so they're available to the runner-service
  cp %{_datadir}/ceph-ansible/site.yml.sample %{_datadir}/ceph-ansible/site.yml 
  cp %{_datadir}/ceph-ansible/site-docker.yml.sample %{_datadir}/ceph-ansible/site-docker.yml 
  cp %{_datadir}/ceph-ansible/site-docker.yml.sample %{_datadir}/ceph-ansible/site-container.yml 

# TODO: Could change ansible-runner-service target_user parm = ceph (default will be root)
#       i.e add the parameter and restart runner-service daemon
fi


%files
%{_datadir}/cockpit/*
%{_datadir}/metainfo/*

%changelog
* Sun Mar 17 2019 Paul Cuzner <pcuzner@redhat.com> 0.8.6
- Added 'save' step in deploy workflow, enabling ansible vars to be manually updated
* Sun Dec 16 2018 Paul Cuzner <pcuzner@redhat.com> 0.8
- Initial rpm build
- First functionally complete version
