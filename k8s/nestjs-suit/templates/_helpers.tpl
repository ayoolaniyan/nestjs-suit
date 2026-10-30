{{/* Image reference for a service: registry/name:tag. */}}
{{- define "nestjs-suit.image" -}}
{{ required "global.imageRegistry is required" .root.Values.global.imageRegistry }}/{{ .name }}:{{ .root.Values.global.imageTag }}
{{- end }}

{{/* Connection settings for the database-backed services. */}}
{{- define "nestjs-suit.mysqlEnv" -}}
- name: MYSQL_HOST
  value: {{ required "mysql.host is required" .Values.mysql.host | quote }}
- name: MYSQL_PORT
  value: {{ .Values.mysql.port | quote }}
- name: MYSQL_DATABASE
  value: {{ .Values.mysql.database | quote }}
- name: MYSQL_USER
  valueFrom:
    secretKeyRef:
      name: {{ .Values.mysql.secretName }}
      key: username
- name: MYSQL_PASSWORD
  valueFrom:
    secretKeyRef:
      name: {{ .Values.mysql.secretName }}
      key: password
{{- end }}

{{/*
Container hardening. runAsUser is numeric because Kubernetes cannot verify
runAsNonRoot against the image's named `node` user (uid 1000).
*/}}
{{- define "nestjs-suit.securityContext" -}}
securityContext:
  runAsNonRoot: true
  runAsUser: 1000
  allowPrivilegeEscalation: false
{{- end }}

{{/* Pod annotations for the HTTP services, which serve /metrics. */}}
{{- define "nestjs-suit.metricsAnnotations" -}}
prometheus.io/scrape: 'true'
prometheus.io/path: /metrics
prometheus.io/port: {{ .port | quote }}
{{- end }}

{{/* HTTP probes against the terminus endpoints in libs/common/health. */}}
{{- define "nestjs-suit.httpProbes" -}}
startupProbe:
  # Allows time for migrations on first boot.
  httpGet:
    path: /health
    port: http
  periodSeconds: 5
  failureThreshold: 30
livenessProbe:
  httpGet:
    path: /health
    port: http
  periodSeconds: 10
readinessProbe:
  httpGet:
    path: /health/ready
    port: http
  periodSeconds: 5
{{- end }}

{{/* Security settings for the public HTTP services. */}}
{{- define "nestjs-suit.securityEnv" -}}
- name: CORS_ORIGINS
  value: {{ .Values.security.corsOrigins | quote }}
- name: TRUST_PROXY_HOPS
  value: {{ .Values.security.trustProxyHops | quote }}
- name: RATE_LIMIT_PER_MINUTE
  value: {{ .Values.security.rateLimitPerMinute | quote }}
{{- end }}

{{/* RabbitMQ connection, from its Secret. */}}
{{- define "nestjs-suit.rabbitmqEnv" -}}
- name: RABBITMQ_URL
  valueFrom:
    secretKeyRef:
      name: {{ .Values.rabbitmq.secretName }}
      key: url
{{- end }}
