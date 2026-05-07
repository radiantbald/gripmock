package app

import (
	"net/http"
	"strings"
	"time"

	"github.com/cockroachdb/errors"
	"github.com/goccy/go-json"
	"github.com/jackc/pgx/v5"

	pgallowlist "github.com/bavix/gripmock/v3/internal/infra/postgres/allowlist"
)

const phoneAuthCodeTTL = 5 * time.Minute

type callRequestPayload struct {
	Phone string `json:"phone"`
}

type callVerifyPayload struct {
	Phone string `json:"phone"`
	Code  string `json:"code"`
}

func (h *RestServer) RequestCallAuth(w http.ResponseWriter, r *http.Request) {
	if h.allowedPhones == nil {
		w.WriteHeader(http.StatusServiceUnavailable)
		h.writeResponseError(r.Context(), w, errors.New("phone auth is unavailable"))

		return
	}

	var payload callRequestPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		h.writeResponseError(r.Context(), w, errors.Wrap(err, "invalid auth request payload"))

		return
	}

	phone := normalizePhone(payload.Phone)
	if len(phone) < 10 {
		w.WriteHeader(http.StatusBadRequest)
		h.writeResponseError(r.Context(), w, errors.New("phone must contain at least 10 digits"))

		return
	}

	allowedEntry, err := h.allowedPhones.FindAllowedByPhone(r.Context(), phone, time.Now())
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			w.WriteHeader(http.StatusUnauthorized)
			h.writeResponseError(r.Context(), w, errors.New("phone is not in allowlist"))

			return
		}

		w.WriteHeader(http.StatusInternalServerError)
		h.writeResponseError(r.Context(), w, err)

		return
	}

	verificationCode := normalizeCode(allowedEntry.Code)
	if len(verificationCode) != 4 {
		w.WriteHeader(http.StatusInternalServerError)
		h.writeResponseError(r.Context(), w, errors.New("allowlist code must contain 4 digits"))

		return
	}

	h.writeResponse(r.Context(), w, map[string]any{
		"ok":               true,
		"phone":            phone,
		"expiresInSeconds": int(phoneAuthCodeTTL.Seconds()),
	})
}

func (h *RestServer) VerifyCallAuth(w http.ResponseWriter, r *http.Request) {
	if h.usersRepository == nil || h.allowedPhones == nil {
		w.WriteHeader(http.StatusServiceUnavailable)
		h.writeResponseError(r.Context(), w, errors.New("phone auth is unavailable"))

		return
	}

	var payload callVerifyPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		h.writeResponseError(r.Context(), w, errors.Wrap(err, "invalid auth verify payload"))

		return
	}

	phone := normalizePhone(payload.Phone)
	code := normalizeCode(payload.Code)
	if len(phone) < 10 {
		w.WriteHeader(http.StatusBadRequest)
		h.writeResponseError(r.Context(), w, errors.New("phone must contain at least 10 digits"))

		return
	}

	if len(code) != 4 {
		w.WriteHeader(http.StatusBadRequest)
		h.writeResponseError(r.Context(), w, errors.New("code must contain 4 digits"))

		return
	}

	allowedEntry, err := h.allowedPhones.FindAllowedByPhone(r.Context(), phone, time.Now())
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			w.WriteHeader(http.StatusUnauthorized)
			h.writeResponseError(r.Context(), w, errors.New("phone is not in allowlist"))

			return
		}

		w.WriteHeader(http.StatusInternalServerError)
		h.writeResponseError(r.Context(), w, err)

		return
	}

	if normalizeCode(allowedEntry.Code) != code {
		w.WriteHeader(http.StatusUnauthorized)
		h.writeResponseError(r.Context(), w, errors.New("invalid verification code"))

		return
	}

	user, err := h.usersRepository.UpsertByPhone(r.Context(), phone)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		h.writeResponseError(r.Context(), w, err)

		return
	}

	h.writeResponse(r.Context(), w, map[string]any{
		"ok":    true,
		"phone": user.Phone,
	})
}

type allowlistUpsertPayload struct {
	Phone     string     `json:"phone"`
	Code      string     `json:"code"`
	Active    *bool      `json:"active"`
	Comment   string     `json:"comment"`
	ExpiresAt *time.Time `json:"expiresAt"`
}

type allowlistDeletePayload struct {
	Phone string `json:"phone"`
}

func (h *RestServer) ListAllowedPhones(w http.ResponseWriter, r *http.Request) {
	if h.allowedPhones == nil {
		w.WriteHeader(http.StatusServiceUnavailable)
		h.writeResponseError(r.Context(), w, errors.New("allowlist repository is unavailable"))

		return
	}

	items, err := h.allowedPhones.List(r.Context())
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		h.writeResponseError(r.Context(), w, err)

		return
	}

	h.writeResponse(r.Context(), w, map[string]any{"items": items})
}

func (h *RestServer) UpsertAllowedPhone(w http.ResponseWriter, r *http.Request) {
	if h.allowedPhones == nil {
		w.WriteHeader(http.StatusServiceUnavailable)
		h.writeResponseError(r.Context(), w, errors.New("allowlist repository is unavailable"))

		return
	}

	var payload allowlistUpsertPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		h.writeResponseError(r.Context(), w, errors.Wrap(err, "invalid allowlist payload"))

		return
	}

	phone := normalizePhone(payload.Phone)
	code := normalizeCode(payload.Code)
	if len(phone) < 10 {
		w.WriteHeader(http.StatusBadRequest)
		h.writeResponseError(r.Context(), w, errors.New("phone must contain at least 10 digits"))

		return
	}

	if len(code) != 4 {
		w.WriteHeader(http.StatusBadRequest)
		h.writeResponseError(r.Context(), w, errors.New("code must contain 4 digits"))

		return
	}

	active := true
	if payload.Active != nil {
		active = *payload.Active
	}

	entry, err := h.allowedPhones.Upsert(r.Context(), pgAllowlistEntry(phone, code, active, payload.Comment, payload.ExpiresAt))
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		h.writeResponseError(r.Context(), w, err)

		return
	}

	h.writeResponse(r.Context(), w, map[string]any{"item": entry})
}

func (h *RestServer) DeleteAllowedPhone(w http.ResponseWriter, r *http.Request) {
	if h.allowedPhones == nil {
		w.WriteHeader(http.StatusServiceUnavailable)
		h.writeResponseError(r.Context(), w, errors.New("allowlist repository is unavailable"))

		return
	}

	var payload allowlistDeletePayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		h.writeResponseError(r.Context(), w, errors.Wrap(err, "invalid allowlist delete payload"))

		return
	}

	phone := normalizePhone(payload.Phone)
	if len(phone) < 10 {
		w.WriteHeader(http.StatusBadRequest)
		h.writeResponseError(r.Context(), w, errors.New("phone must contain at least 10 digits"))

		return
	}

	if err := h.allowedPhones.Delete(r.Context(), phone); err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		h.writeResponseError(r.Context(), w, err)

		return
	}

	h.writeResponse(r.Context(), w, map[string]any{"ok": true, "phone": phone})
}

func normalizePhone(value string) string {
	raw := strings.TrimSpace(value)
	if raw == "" {
		return ""
	}

	builder := strings.Builder{}
	for _, char := range raw {
		if char >= '0' && char <= '9' {
			builder.WriteRune(char)
		}
	}

	digits := builder.String()
	if digits == "" {
		return ""
	}

	return "+" + digits
}

func normalizeCode(value string) string {
	builder := strings.Builder{}
	for _, char := range strings.TrimSpace(value) {
		if char >= '0' && char <= '9' {
			builder.WriteRune(char)
		}
	}

	code := builder.String()
	if len(code) > 4 {
		return code[:4]
	}

	return code
}

func pgAllowlistEntry(phone string, code string, active bool, comment string, expiresAt *time.Time) pgallowlist.Entry {
	return pgallowlist.Entry{
		Phone:     phone,
		Code:      code,
		Active:    active,
		Comment:   strings.TrimSpace(comment),
		ExpiresAt: expiresAt,
	}
}
