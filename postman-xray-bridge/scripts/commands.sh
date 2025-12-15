# ============================================================================
# 1. RUN TESTS
# ============================================================================

# Newman - Run tests and export JUnit XML
cd ../loanflow-service && npx newman run collections/loanflow-tests.postman_collection.json -r junit --reporter-junit-export ../postman-xray-bridge/test-results/newman/loanflow-results.xml

# With collection id
postman collection run 49591604-522ff624-d39e-40bd-9eed-7aa45ffc6d35 --reporters junit --reporter-junit-export ./test-results/postman-cli/loanflow-results.xml


# Note: Requires Postman CLI login first
# postman login --with-api-key $POSTMAN_API_KEY

# ============================================================================
# 2. SYNC RESULTS TO XRAY
# ============================================================================

# Push JUnit XML results to Xray via the bridge
curl -X POST http://localhost:4000/sync \
  -F "file=@./test-results/postman-cli/loanflow-results.xml" \
  -F "projectKey=SJP" \
  -F "testPlanKey=SJP-1"

