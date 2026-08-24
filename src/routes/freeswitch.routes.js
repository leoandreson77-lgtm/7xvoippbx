const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { createLogger } = require('../utils/logger');
const config = require('../config');

const prisma = new PrismaClient();
const log = createLogger('freeswitch-routes');
const router = express.Router();

/**
 * POST /fs-config
 * mod_xml_curl handler.
 * FreeSWITCH calls this endpoint to dynamically resolve extension configurations.
 * Returns XML directory entries from the database.
 */
router.post('/', express.urlencoded({ extended: false }), async (req, res) => {
  const { section, user, domain, action, key_value } = req.body;

  log.debug('mod_xml_curl request', { section, user, domain, action, key_value });

  // Only handle directory lookups
  if (section !== 'directory') {
    return res.type('application/xml').send(notFoundXml(section));
  }

  // For registration/auth challenges, FreeSWITCH sends the username
  const username = user || key_value || '';

  if (!username) {
    return res.type('application/xml').send(notFoundXml(section));
  }

  try {
    // Look up extension in database
    const extension = await prisma.extension.findUnique({
      where: { sipUsername: username },
    });

    if (!extension || !extension.enabled) {
      log.debug(`Extension ${username} not found or disabled`);
      return res.type('application/xml').send(notFoundXml(section));
    }

    const realm = extension.realm || config.sip.domain;

    // Return XML directory entry with HA1 (a]1-hash) for SIP digest auth
    // This avoids storing plaintext passwords in FreeSWITCH XML files.
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<document type="freeswitch/xml">
  <section name="directory">
    <domain name="${realm}">
      <params>
        <param name="dial-string" value="{^^:sip_invite_domain=\${dialed_domain}:presence_id=\${dialed_user}@\${dialed_domain}}$\{sofia_contact(*/${extension.sipUsername}@${realm})}"/>
      </params>
      <groups>
        <group name="default">
          <users>
            <user id="${extension.sipUsername}">
              <params>
                <param name="a1-hash" value="${extension.sipHa1}"/>
                <param name="vm-password" value="0000"/>
              </params>
              <variables>
                <variable name="toll_allow" value="domestic,international,local"/>
                <variable name="accountcode" value="${extension.sipUsername}"/>
                <variable name="user_context" value="default"/>
                <variable name="effective_caller_id_name" value="${extension.sipUsername}"/>
                <variable name="effective_caller_id_number" value="${extension.sipUsername}"/>
                <variable name="outbound_caller_id_name" value="7XVOIP"/>
                <variable name="outbound_caller_id_number" value="${config.trunk.did || extension.number}"/>
              </variables>
            </user>
          </users>
        </group>
      </groups>
    </domain>
  </section>
</document>`;

    log.debug(`Returning directory XML for ${username}`);
    res.type('application/xml').send(xml);
  } catch (err) {
    log.error('mod_xml_curl error', err.message);
    res.type('application/xml').send(notFoundXml(section));
  }
});

function notFoundXml(section) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<document type="freeswitch/xml">
  <section name="${section || 'directory'}">
    <result status="not found"/>
  </section>
</document>`;
}

module.exports = router;
