#!/bin/sh
set -e

echo "=================================================="
echo "  Starting 7XVOIP FreeSWITCH PBX Container"
echo "=================================================="

# 1. Ensure SSL certificates directory and file exist to prevent curl 77 errors
mkdir -p /etc/ssl/certs /tmp /var/run/freeswitch
touch /etc/ssl/certs/ca-certificates.crt 2>/dev/null || true

# 2. Check if configuration directory /etc/freeswitch needs initialization
if [ ! -f "/etc/freeswitch/freeswitch.xml" ]; then
    echo "[*] Initializing /etc/freeswitch/ from vanilla templates..."
    mkdir -p /etc/freeswitch
    cp -varf /usr/share/freeswitch/conf/vanilla/* /etc/freeswitch/
fi

# 3. Disable mod_signalwire in modules.conf.xml (avoids startup crash if certs are missing)
sed -i '/mod_signalwire/d' /etc/freeswitch/autoload_configs/modules.conf.xml 2>/dev/null || true
sed -i '/mod_signalwire/d' /usr/share/freeswitch/conf/vanilla/autoload_configs/modules.conf.xml 2>/dev/null || true

# 4. Copy project's customized dialplans, sip profiles, and xml_curl
if [ -d "/opt/custom-freeswitch-conf" ]; then
    echo "[*] Applying custom project configurations (dialplans, sip_profiles, xml_curl)..."
    [ -f "/opt/custom-freeswitch-conf/default.xml" ] && cp -vf /opt/custom-freeswitch-conf/default.xml /etc/freeswitch/dialplan/default.xml
    [ -f "/opt/custom-freeswitch-conf/public.xml" ] && cp -vf /opt/custom-freeswitch-conf/public.xml /etc/freeswitch/dialplan/public.xml
    [ -f "/opt/custom-freeswitch-conf/internal.xml" ] && cp -vf /opt/custom-freeswitch-conf/internal.xml /etc/freeswitch/sip_profiles/internal.xml
    [ -f "/opt/custom-freeswitch-conf/xml_curl.conf.xml" ] && cp -vf /opt/custom-freeswitch-conf/xml_curl.conf.xml /etc/freeswitch/autoload_configs/xml_curl.conf.xml
fi

# 5. Configure Dynamic ACL for ESL Node.js access (esl_node)
ALLOWED_IP="${ESL_ALLOWED_IP:-172.16.0.0/12}"
case "$ALLOWED_IP" in
  */*) CIDR_IP="$ALLOWED_IP" ;;
  *)   CIDR_IP="${ALLOWED_IP}/32" ;;
esac

echo "[*] Configuring ACL 'esl_node' for CIDR: ${CIDR_IP}, 172.16.0.0/12, 10.0.0.0/8, and 127.0.0.1/32..."

for ACL_FILE in /etc/freeswitch/autoload_configs/acl.conf.xml /usr/share/freeswitch/conf/vanilla/autoload_configs/acl.conf.xml; do
  if [ -f "$ACL_FILE" ]; then
    # Idempotent cleanup of existing esl_node list
    sed -i '/<list name="esl_node"/,/<\/list>/d' "$ACL_FILE"
    
    # Inject clean esl_node block right inside <network-lists>
    awk -v cidr="$CIDR_IP" '
    /<network-lists>/ {
      print $0
      print "    <list name=\"esl_node\" default=\"deny\">"
      print "      <node type=\"allow\" cidr=\"" cidr "\"/>"
      print "      <node type=\"allow\" cidr=\"172.16.0.0/12\"/>"
      print "      <node type=\"allow\" cidr=\"10.0.0.0/8\"/>"
      print "      <node type=\"allow\" cidr=\"127.0.0.1/32\"/>"
      print "    </list>"
      next
    }
    { print }
    ' "$ACL_FILE" > "${ACL_FILE}.tmp" && mv "${ACL_FILE}.tmp" "$ACL_FILE"
  fi
done

# 6. Apply Custom event_socket.conf.xml with esl_node ACL
ESL_PASS="${FREESWITCH_PASSWORD:-${FREESWITCH_ESL_PASSWORD:-ClueCon}}"

echo "[*] Finalizing event_socket.conf.xml (listen 0.0.0.0:8021, ACL: esl_node)..."
cat << EOF > /etc/freeswitch/autoload_configs/event_socket.conf.xml
<configuration name="event_socket.conf" description="Socket Client">
  <settings>
    <param name="nat-map" value="false"/>
    <param name="listen-ip" value="0.0.0.0"/>
    <param name="listen-port" value="8021"/>
    <param name="password" value="${ESL_PASS}"/>
    <param name="apply-inbound-acl" value="esl_node"/>
  </settings>
</configuration>
EOF
cp -vf /etc/freeswitch/autoload_configs/event_socket.conf.xml /usr/share/freeswitch/conf/vanilla/autoload_configs/event_socket.conf.xml 2>/dev/null || true

# 7. Apply SIP default password in vars.xml if specified
SIP_PASS="${FREESWITCH_DEFAULT_PASSWORD:-${FREESWITCH_PASSWORD:-Agent@123}}"
sed -i -e "s/default_password=.*\?/default_password=$SIP_PASS\"/" /etc/freeswitch/vars.xml 2>/dev/null || true

echo "=================================================="
echo "  Configuration Finalized. Starting FreeSWITCH... "
echo "=================================================="

# 8. Start FreeSWITCH
# If command arguments are passed, execute them; otherwise default to freeswitch -nc -nf -nonat
if [ "$#" -gt 0 ] && [ "$1" != "freeswitch" ]; then
    exec "$@"
else
    exec /usr/bin/freeswitch -nc -nf -nonat
fi
