
import { Contact, AgencyBranding } from '../types';

/**
 * Service to handle MailerLite API interactions.
 * Note: Browser-side API calls to MailerLite may require a proxy if CORS is enabled.
 */
export const syncSubscriberToMailerLite = async (contact: Contact, branding: AgencyBranding): Promise<{ success: boolean; error?: string }> => {
    const config = branding.mailerLite;
    if (!config?.apiKey || !config?.groupId) {
        return { success: false, error: 'MailerLite API Key or Group ID missing in settings.' };
    }

    try {
        // MailerLite API v2 endpoint for adding subscribers to a group
        const response = await fetch(`https://api.mailerlite.com/api/v2/groups/${config.groupId}/subscribers`, {
            method: 'POST',
            headers: {
                'X-MailerLite-ApiKey': config.apiKey,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                email: contact.email,
                name: contact.name,
                fields: {
                    company: contact.company,
                    status: contact.status,
                    revenue: contact.revenue?.toString() || '0'
                }
            }),
        });

        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.error?.message || 'MailerLite API Error');
        }

        return { success: true };
    } catch (error: any) {
        console.error('MailerLite Sync Failed:', error);
        return { success: false, error: error.message };
    }
};

export const bulkSyncLeads = async (contacts: Contact[], branding: AgencyBranding): Promise<{ total: number; successful: number }> => {
    let successful = 0;
    for (const contact of contacts) {
        const res = await syncSubscriberToMailerLite(contact, branding);
        if (res.success) successful++;
    }
    return { total: contacts.length, successful };
};
