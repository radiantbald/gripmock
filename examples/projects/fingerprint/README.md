## Operational Runbook

### Prerequisites

- PostgreSQL is running and reachable.
- `POSTGRES_DSN` is set.

```bash
export POSTGRES_DSN='postgres://user:pass@localhost:5432/gripmock?sslmode=disable'
```

### Primary Run

```bash
gripmock --stub ./examples/projects/fingerprint ./examples/projects/fingerprint
```

### Secondary Run (restart)

```bash
gripmock ./examples/projects/fingerprint
```

### Verify

```bash
gripmock check --timeout 20s
curl http://127.0.0.1:4771/api/health/readiness
```

### Troubleshooting

- If startup fails, verify `POSTGRES_DSN` and DB connectivity.
- If descriptors conflict after local refactors, reset local compose DB (`make reset-db`).
- If tests race startup, wait with `gripmock check` before test execution.
# 👆 Fingerprint Service 👆

**A priority-based fingerprint validation service demonstrating stub matching with GripMock**

## 📌 Overview

This Fingerprint Service example demonstrates **priority-based stub matching** - a powerful feature for handling different scenarios with varying levels of specificity. The service validates fingerprint IDs and uses a three-tier priority system to route requests appropriately.

## 🚀 Features

✅ **Three-Tier Priority System** – High (100), Medium (2), and Low (1) priority stub matching  
✅ **Exact Matching** – Specific user ID validation with highest priority  
✅ **Pattern Matching** – Regex-based matching for medium priority  
✅ **Fallback Logic** – General catch-all for unmatched requests  
✅ **Stub-Driven Testing** – Comprehensive test coverage with GripMock  
✅ **Priority Hierarchy** – Clear decision-making logic for request routing  

## 🔍 Test Cases

The service includes three test scenarios that validate the priority system:

### 1. **High Priority (Priority: 100)**
- **Test File**: `case_high_priority.gctf`
- **Input**: `{"id":"user123"}`
- **Expected**: `{"valid":true, "id":123}`
- **Logic**: Exact match for specific user ID

### 2. **Medium Priority (Priority: 2)**
- **Test File**: `case_medium_priority.gctf`
- **Input**: `{"id":"user321"}`
- **Expected**: `{"valid":true, "id":321}`
- **Logic**: Regex pattern matching (`user\d+`)

### 3. **Low Priority (Priority: 1)**
- **Test File**: `case_low_priority.gctf`
- **Input**: `{"id":"hello"}`
- **Expected**: `{"valid":false, "id":0}`
- **Logic**: General fallback for unmatched requests

## 📂 Project Structure

```
examples/projects/fingerprint/
├── service.proto                 # Protocol buffer service definition
├── stubs.yaml                    # Mock responses with priority system
├── case_high_priority.gctf       # High priority test case
├── case_medium_priority.gctf     # Medium priority test case
└── case_low_priority.gctf        # Low priority test case
```

## 🛠️ Getting Started

### Run the Service

Start GripMock with the fingerprint service:

```bash
gripmock --stub examples/projects/fingerprint examples/projects/fingerprint/service.proto
```

### Run Tests

Execute the test suite using **grpctestify**:

```bash
grpctestify examples/projects/fingerprint/
```

## 👆 Priority Matching Logic

The service implements a sophisticated priority-based routing system:

### **High Priority (100) - Exact Match**
```yaml
input:
  equals:
    id: "user123"
```
- Matches the specific user ID "user123"
- Returns `{"valid":true, "id":123}`
- Highest priority for VIP users

### **Medium Priority (2) - Pattern Match**
```yaml
input:
  matches:
    id: "user\\d+"
```
- Matches any user ID following the pattern "user" + digits
- Returns `{"valid":true, "id":321}`
- Handles regular users with predictable IDs

### **Low Priority (1) - Fallback**
```yaml
input:
  contains: {}
```
- Catches all remaining requests
- Returns `{"valid":false, "id":0}`
- Default response for unknown users

## 🔧 Service Definition

The service provides a simple fingerprint validation endpoint:

```protobuf
service Fingerprint {
  rpc Check(CheckRequest) returns (CheckResponse);
}

message CheckRequest {
  string id = 1;
}

message CheckResponse {
  int32 id = 1;
  bool valid = 2;
}
```

## ⚠️ Important Notes

- **Unary Service**: All methods are unary (no streaming support)
- **Priority Order**: Higher priority stubs are matched first
- **Fallback Strategy**: Always provides a response, even for unknown inputs
- **Testing**: Uses GripMock's comprehensive testing framework

## 🤝 Contributing

When contributing to this example:

- Ensure all priority levels are properly tested
- Validate fallback behavior works correctly
- Test edge cases in stub matching
- Maintain the priority hierarchy logic

---

*Built with ❤️ using GripMock and Protocol Buffers* 