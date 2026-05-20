## Operational Runbook

### Prerequisites

- PostgreSQL is running and reachable.
- `POSTGRES_DSN` is set.

```bash
export POSTGRES_DSN='postgres://user:pass@localhost:5432/gripmock?sslmode=disable'
```

### Primary Run

```bash
gripmock --stub ./examples/projects/faker ./examples/projects/faker
```

### Secondary Run (restart)

```bash
gripmock ./examples/projects/faker
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
# Faker Example

This project demonstrates how to use the built-in faker functionality in GripMock to generate dynamic, realistic data in your stubs.

## Structure

- `service.proto`: Defines a `UserService` with a `GetProfile` method.
- `stub.yaml`: Contains stubs that use `faker` templates to populate response fields.

## How to run

1. Start GripMock with this project:
   ```bash
   # from repo source (recommended while developing):
   go run main.go --stub examples/projects/faker/stub.yaml examples/projects/faker/service.proto

   # or installed binary:
   gripmock --stub examples/projects/faker/stub.yaml examples/projects/faker/service.proto
   ```

2. Make a request to the `GetProfile` method:
   ```bash
   # Using grpcurl
   grpcurl -plaintext -d '{"id": "123"}' localhost:4770 example.UserService/GetProfile
   ```

## Faker fields used

The example stub populates the following fields using faker:
- `first_name`: `{{faker.Person.FirstName}}`
- `last_name`: `{{faker.Person.LastName}}`
- `email`: `{{faker.Contact.Email}}`
- `city`: `{{faker.Geo.City}}`
- `lat`: `{{faker.Geo.Latitude}}`
- `lon`: `{{faker.Geo.Longitude}}`
- `ip`: `{{faker.Network.IPv4}}`
- `user_agent`: `{{faker.Network.UserAgent}}`
- `company`: `{{faker.Company.Company}}`
- `product`: `{{faker.Commerce.ProductName}}`
- `bio`: `{{faker.Text.Paragraph 1}}`
- `created_at`: `{{faker.DateTime.PastDate}}`
- `account_id`: `{{faker.Identity.UUID}}`
