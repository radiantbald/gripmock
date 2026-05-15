package muxmiddleware

import "net/http"

// TransportRoom moves X-Gripmock-Room into internal context and strips the header.
func TransportRoom(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		consumed, resetHint := ConsumeRequestWithResetHint(r)
		if resetHint {
			w.Header().Set(ResetHeaderName, "1")
		}

		next.ServeHTTP(w, consumed)
	})
}
