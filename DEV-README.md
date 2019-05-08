
instructions for F28


pre-reqs
needed to add 
npm install --save-dev @babel/plugin-proposal-class-properties
npm install --save-dev babel-plugin-transform-es2015-arrow-functions

and update babelrc to include;
    "plugins": ["transform-es2015-arrow-functions",
                "@babel/plugin-proposal-class-properties"]
Download the runner-service
make sure it's running from a 'short' directory (long paths cause problems with ssh currently in runner)
in dev mode just start it
start the runner-service
- copy the svctoken to the /etc/ansible-runner-service directory
confirm it's available (try the /api endpoint)
- you may need to open port 5001
- put checkrole in your samples/project directory (playbook and library/module needed)

create your cockpit dev environment
clone the ceph-installer repo
run make to compile the JSX code
- this will create a dist directory

create cockpit directory in root's home folder
mkdir -p .local/share/cockpit
add a symlink to the dist folder in your ceph-installer directory
cd /root/.local/share/cockpit
ln -s ~/ceph-installer/dist/ ceph-installer



Set up multiple entries in /etc/hosts pointing to you local machine
e.g
127.0.0.1 ceph-1
127.0.0.1 ceph-2
ensure ssh is available under the account runner-service to your local machine (using the names registered in hosts)

login to cockpit as root
select the ceph installer
