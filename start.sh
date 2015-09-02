cd /tmp

# try to remove the repo if it already exists
rm -rf usana_couchbase_auth; true
git clone https://github.com/chrisdurtschi/usana_couchbase_auth.git
cd usana_couchbase_auth
npm install
npm start
