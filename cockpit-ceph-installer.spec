Name: cockpit-ceph-installer
Version: 0.8
Release: 8%{?dist}
Summary: Cockpit plugin for Ceph cluster installation
License: LGPLv2+

Source: ceph-installer-%{version}.tar.gz
BuildArch: noarch

Requires: ceph-ansible >= 3.1
Requires: cockpit 
Requires: cockpit-bridge

%if "%{?dist}" == ".el7" || "%{rhel}" == "7"
%define containermgr    docker
%else
%define containermgr    podman
%endif

Requires: %{containermgr}

%description
This package installs a plugin for cockpit that provides a graphical means of installing a Ceph cluster. The plugin handles UI interaction and makes API calls to the ansible-runner-service API daemon, running on localhost, to run Ansible playbooks to handle the installation. The package provides a helper script called ansible-runner-service.sh to handle the installation of the ansible-runner-service daemon (container)

%prep
%setup -q -n ceph-installer-%{version}

%install
mkdir -p %{buildroot}%{_datadir}/cockpit/%{name}
mkdir -p %{buildroot}%{_bindir}
install -m 0644 dist/* %{buildroot}%{_datadir}/cockpit/%{name}/
install -m 0755 utils/ansible-runner-service.sh %{buildroot}%{_bindir}/
mkdir -p %{buildroot}%{_datadir}/metainfo/
install -m 0644 ./org.cockpit-project.%{name}.metainfo.xml %{buildroot}%{_datadir}/metainfo/

%post
if [ "$1" = 1 ]; then
  systemctl enable --now cockpit.service

# copy the ceph-ansible sample playbooks, so they're available to the runner-service
  cp %{_datadir}/ceph-ansible/site.yml.sample %{_datadir}/ceph-ansible/site.yml 
  cp %{_datadir}/ceph-ansible/site-docker.yml.sample %{_datadir}/ceph-ansible/site-docker.yml 
  cp %{_datadir}/ceph-ansible/site-docker.yml.sample %{_datadir}/ceph-ansible/site-container.yml 

# start the container manager daemon
  systemctl enable --now %{containermgr}.service

fi


%files
%{_datadir}/cockpit/*
%{_datadir}/metainfo/*
%{_bindir}/ansible-runner-service.sh

%changelog
* Wed Jul 17 2019 Paul Cuzner <pcuzner@redhat.com> 0.8-8
- remove ansible-runner-service rpm dependency
- handle podman/docker for el7/el8
- ensure the ansible-runner-service setup script is installed
* Thu Mar 21 2019 Paul Cuzner <pcuzner@redhat.com> 0.8-7
- Return error if the probe task fails in some way
- Add visual cue (spinner) when the probe task is running
* Sun Mar 17 2019 Paul Cuzner <pcuzner@redhat.com> 0.8-6
- Added 'save' step in deploy workflow, enabling ansible vars to be manually updated
* Sun Dec 16 2018 Paul Cuzner <pcuzner@redhat.com> 0.8
- Initial rpm build
- First functionally complete version