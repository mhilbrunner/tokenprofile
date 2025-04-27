const { DialogV2 } = foundry.applications.api;
const { mergeObject } = foundry.utils;
import alea from './alea.js';

class TokenProfile {
    static LOG = true;
    static DEBUG_VIS = false;
    static PROFILE_NAME_MAX_LEN = 16;
    static PROFILE_NAME_PATTERN = '\\w\\-\\(\\)\\!\\*\\.\\^,|°~%&§/=?#öÖäÄüÜßẞ\\@×÷½¼¾²³$€¥©®™ ';
    static TAG_NAME_PATTERN = 'a-zA-Z0-9,\\-_';
    static TAG_NAME_FORCE_LOWER = true;

    static VISIBILITY = {
        DEFAULT: 'default',
        HIDDEN: 'hidden',
        SHOW: 'show',
        SHOW_IF_NOT_SECRET: 'not_secret',
        SHOW_IF_FRIENDLY: 'friendly',
        SHOW_IF_LIMITED: 'limited',
        SHOW_IF_OBSERVER: 'observer',
        SHOW_IF_OWNER: 'owner',
        SHOW_IF_GM: 'gm'
    };

    static PROFILE_DEFAULT = {
        id: undefined,
        name: 'TokenProfile.profile.new',
        enabled: true,
        paragraphs: {}
    };

    static PARAGRAPH_DEFAULT = {
        id: undefined,
        visibility: TokenProfile.VISIBILITY.DEFAULT,
        tags_self: '',
        tags_viewer: '',
        text: ''
    }

    static openEditor(doc) {
        return TokenProfileEditor.open(doc);
    }

    static getViewer() {
        const owned = canvas?.tokens?.controlled?.filter(t => t.isOwner);
        if (owned?.length) return owned[0];

        if (canvas?.tokens?.controlled?.length) return canvas?.tokens?.controlled[0];

        if (game?.user?.character?.prototypeToken) return game?.user?.character?.prototypeToken;

        return undefined;
    }

    static async getActor(x) {
        if (!x) return undefined;
        if (x instanceof Actor) {
            return x;
        }
        if (x.actor instanceof Actor) {
            return x.actor;
        }
        return undefined;
    }

    static async updateProfile(x, data = {}, options = {}) {
        if (TokenProfile.LOG) {
            console.log('TokenProfile: Updating profile:', x, data, options)
        }

        if (!data) return undefined;

        const opt = mergeObject({
            skipExisting: false
        }, options, { inplace: false });

        const actor = await TokenProfile.getActor(x);
        if (!actor || !actor.isOwner) return undefined;

        if (data.name) {
            data.name = String(data.name).trim().replace(`[^${TokenProfile.PROFILE_NAME_PATTERN}]`, '');
            if (data.name?.length > TokenProfile.PROFILE_NAME_MAX_LEN) {
                data.name = data.substring(0, TokenProfile.PROFILE_NAME_MAX_LEN);
            }
        }

        if (!data.id) {
            data.id = foundry.utils.randomID();
            if (await TokenProfile.getProfile(actor, data.id)) {
                console.log('TokenProfile: ID collision when creating profile with ID', data.id, 'for actor', actor);
                return undefined;
            }
        } else {
            const existing = await TokenProfile.getProfile(actor, data.id);
            if (existing && opt.skipExisting) {
                return undefined;
            }
        }

        if (!data.id || !data.id.length) return undefined;

        let update = {};
        update[data.id] = data;
        await actor.setFlag('tokenprofile', 'profiles', update);
        return TokenProfile.getProfile(actor, data.id);
    }

    static async addProfile(x, initialData = {}) {
        const actor = await TokenProfile.getActor(x);
        if (!actor || !actor.isOwner) return undefined;

        const profile = mergeObject(TokenProfile.PROFILE_DEFAULT, initialData, { inplace: false });
        return TokenProfile.updateProfile(actor, profile, { skipExisting: true });
    }

    static async removeProfile(x, id) {
        const actor = await TokenProfile.getActor(x);
        if (!actor || !actor.isOwner) return false;
        if (!(await TokenProfile.getProfile(actor, id))) return false;
        return actor.unsetFlag('tokenprofile', 'profiles.' + id);
    }

    static async getProfiles(x) {
        return (await TokenProfile.getFlag(x, 'profiles')) ?? {};
    }

    static async getFlag(x, key) {
        const actor = await TokenProfile.getActor(x);
        if (!actor) return undefined;
        return actor.getFlag('tokenprofile', key);
    }

    static async getVisibleProfiles(x, viewer) {
        const profiles = await TokenProfile.getProfiles(x);
        var profiles_visible = {};
        if (profiles) {
            for (const key of Object.keys(profiles)) {
                const visible = await TokenProfile.canSeeProfile(x, key, viewer);
                if (visible) {
                    profiles_visible[key] = profiles[key];
                }
            }
        }
        return profiles_visible;
    }

    static async getProfile(x, id) {
        if (!x || !id) return undefined;
        return (await TokenProfile.getProfiles(x))[id];
    }

    static async getProfileForDisplay(x, viewer) {
        const profiles = await TokenProfile.getVisibleProfiles(x, viewer);
        if (!profiles || !Object.keys(profiles).length) return undefined;

        const hookData = {target: x, viewer, profiles, selected: undefined};
        Hooks.callAll('tokenprofile.getprofilefordisplay', hookData);
        if (hookData.selected) {
            return hookData.selected;
        }

        // Return the profile if its the only one.
        if (Object.keys(profiles).length < 2) return profiles[Object.keys(profiles)[0]];

        // Return the preferred profile if set.
        var preferred = await TokenProfile.getFlag(x, 'preferProfile');
        if (preferred && String(preferred).trim().length) {
            for (const key of Object.keys(profiles)) {
                const p = profiles[key];
                if (p.name.trim().toUpperCase() === preferred.trim().toUpperCase()) {
                    return p;
                }
            }
        }

        // Return random profile if randomize enabled.
        if (await TokenProfile.getFlag(x, 'randomize')) {
            const arng = new alea(x.id ?? (x.actor?.id ?? 'tokenprofile'));
            const rand = Object.keys(profiles)[Object.keys(profiles).length * arng() | 0];
            return profiles[rand];
        }

        // Return first profile.
        return profiles[Object.keys(profiles)[0]];
    }

    static async disableProfiles(x) {
        const profiles = await TokenProfile.getProfiles(x);
        if (!profiles) return;
        for (const key of Object.keys(profiles)) {
            const profile = profiles[key];
            if (profile.enabled) {
                await TokenProfile.updateProfile(x, { id: profile.id, enabled: false })
            }
        }
    }

    static async getProfileContent(x, id, viewer) {
        let profile = undefined;
        if (!id) return '';

        if (!(await TokenProfile.canSeeProfile(x, id, viewer))) return '';
        profile = await TokenProfile.getProfile(x, id);

        if (!profile || !profile.id?.length) return '';

        let content = '';

        for (const pid in profile.paragraphs) {
            const p = await TokenProfile.getParagraphContent(x, id, pid, viewer);
            if (!p || !p.length) continue;
            content += p;
        }

        return content;
    }

    static async canSeeProfile(x, id, viewer) {
        const profile = await TokenProfile.getProfile(x, id);
        if (!profile || !profile.id?.length || !profile.enabled) return false;

        return true;
    }

    static async _debug_vis(x, p, viewer, msg, state) {
        if (!state && TokenProfile.DEBUG_VIS) {
            console.log('Paragraph', p, 'on', x, 'failed visibility test for viewer', viewer, '-', msg);
        }
        return state
    }

    static async canSeeParagraphData(x, paragraphData, viewer) {
        const r = TokenProfile._debug_vis;
        // Hide if empty.
        const p = paragraphData;
        if (!p || !p.id?.length || !p.text?.length) return r(x, p, viewer, 'empty', false);

        // Hide according to paragraph visibility settings.
        let vis = p.visibility;
        if (!vis || !vis.length || vis === TokenProfile.VISIBILITY.DEFAULT) {
            vis = game.settings.get('tokenprofile', 'default.visibility');
            if (!vis?.length) {
                vis = TokenProfile.VISIBILITY.SHOW_IF_NOT_SECRET;
            }
        }

        const { LIMITED, OBSERVER } = CONST.DOCUMENT_OWNERSHIP_LEVELS;
        const { SECRET, FRIENDLY } = CONST.TOKEN_DISPOSITIONS;

        if (vis === TokenProfile.VISIBILITY.SHOW) {
            return r(x, p, viewer, 'always show', true);
        } else if (vis === TokenProfile.VISIBILITY.HIDDEN) {
            return r(x, p, viewer, 'always hide', false);
        } else if (vis === TokenProfile.VISIBILITY.SHOW_IF_FRIENDLY) {
            if (x?.document?.disposition !== FRIENDLY) return r(x, p, viewer, 'not friendly', false);
        } else if (vis === TokenProfile.VISIBILITY.SHOW_IF_GM) {
            if (!game.user.isGM) return r(x, p, viewer, 'not GM', false);
        } else if (vis === TokenProfile.VISIBILITY.SHOW_IF_LIMITED) {
            if (!x?.document?.testUserPermission(game.user, LIMITED)) {
                r(x, p, viewer, 'not LIMITED', false);
            }
        } else if (vis === TokenProfile.VISIBILITY.SHOW_IF_NOT_SECRET) {
            if (x?.document?.disposition === SECRET) return r(x, p, viewer, 'SECRET', false);
        } else if (vis === TokenProfile.VISIBILITY.SHOW_IF_OBSERVER) {
            if (!x?.document?.testUserPermission(game.user, OBSERVER)) return r(x, p, viewer, 'not OBSERVER', false);
        } else if (vis === TokenProfile.VISIBILITY.SHOW_IF_OWNER) {
            if (!x?.isOwner) return r(x, p, viewer, 'not OWNER', false);
        }

        // Hide for hidden tokens/actors if not owner or GM.
        if ('visible' in x && !x.visible && !x.isOwner && !game.user.isGM) {
            return r(x, p, viewer, 'token/actor hidden and neither owner nor GM', false);
        }

        // Hide according to tags.
        if (!TokenProfile.hasTags(x, p.tags_self, { vc_emit: true })) return r(x, p, viewer, 'tags_self mismatch', false);
        if (!TokenProfile.hasTags(viewer, p.tags_viewer, { vc_receive: true })) {
            // Hide if viewer does not match tags, unless no viewer is set and this is a GM.
            if (viewer || !game.user.isGM) return r(x, p, viewer, 'tags_viewer mismatch', false);
        }

        return true;
    }

    static _getVCNames(x, emits = false, receives = false) {
        var out = [];

        if (!game.settings.get('tokenprofile', 'mod.perceptive.enabled')) return out;
        if (!x?.id?.length || (!emits && !receives)) return out;
        const channels = game?.modules?.get('perceptive')?.api?.VisionChannelsUtils?.VCNames();
        if (!channels || !Object.keys(channels).length) return out;
        const flags = x?.document?.flags ?? (x?.flags ?? x?.actor?.flags);
        if (!flags || !Object.keys(flags).length) return out;
        const vcs = flags?.perceptive?.VisionChannelsFlag;
        if (!vcs || !Object.keys(vcs).length) return out;

        for (const key of Object.keys(vcs)) {
            const data = vcs[key];
            if ((emits && data.Emits) || (receives && data.Receives)) {
                if (key in channels) {
                    if (TokenProfile.TAG_NAME_FORCE_LOWER) {
                        out.push(channels[key].toLowerCase());
                    } else {
                        out.push(channels[key]);
                    }
                }
            }
        }

        return out;
    }

    static hasTags(x, tags, opt = {vc_emit: false, vc_receive: false}) {
        if (!tags?.length || !String(tags).trim().length) {
            return true;
        }

        if (!x) {
            return false;
        }

        const tags_parsed = tags.split(',');
        for (var t of tags_parsed) {
            t = t?.trim();
            if (!t || !t.length) continue;

            // Check tagger first.
            if (Tagger?.hasTags(x, t)) continue;

            // Check Vision Channels (Perceptive module).
            const vcs = TokenProfile._getVCNames(x, opt?.vc_emit, opt?.vc_receive);
            if (vcs.includes(t)) continue;

            return false;
        }

        return true;
    }

    // Returns a new obj, with the key keyToMove moved immediately after afterKey.
    static reorderObject(obj, keyToMove, afterKey) {
        if (!(keyToMove in obj) || (afterKey && !(afterKey in obj))) {
            return undefined;
        }

        const newObj = {};
        if (!afterKey) {
            newObj[keyToMove] = obj[keyToMove];
        }

        for (const key in obj) {
            if (key === keyToMove) continue;

            newObj[key] = obj[key];

            if (afterKey && key === afterKey) {
                newObj[keyToMove] = obj[keyToMove];
            }
        }

        return newObj;
    }

    static getPreviousKey(obj, key) {
        if (!obj) return undefined;
        const keys = Object.keys(obj);
        const index = keys.indexOf(key);

        if (index === -1) {
            return undefined;
        }

        return index > 0 ? keys[index - 1] : undefined;
    }

    static getNextKey(obj, targetKey) {
        if (!obj) return undefined;
        const keys = Object.keys(obj);
        const index = keys.indexOf(targetKey);

        if (index === -1) {
            return undefined;
        }

        return index < keys.length - 1 ? keys[index + 1] : undefined;
    }

    static async post(x, content) {
        const actor = (await TokenProfile.getActor(x));
        if (!actor || !actor.isOwner) return;
        const speaker = ChatMessage.getSpeaker({
            scene: canvas.scene._id,
            actor: actor,
            alias: (await TokenProfile.getActorName(actor))
        });
        const rollMode = game.settings.get('core', 'rollMode');
        const data = ChatMessage.applyRollMode({ content, speaker }, rollMode);
        ChatMessage.create(data, { chatBubble: false });
    }

    static async postProfile(x, id) {
        const content = (await TokenProfile.getProfileContent(x, id, x));
        if (!content || !content.length) return;
        return TokenProfile.post(x, content);
    }

    static async postParagraph(x, profileID, paragraphID) {
        const content = (await TokenProfile.getParagraphContent(x, profileID, paragraphID, x));
        if (!content || !content.length) return;
        return TokenProfile.post(x, content);
    }

    static async addParagraph(x, profileID, initialData) {
        const d = mergeObject(TokenProfile.PARAGRAPH_DEFAULT, initialData, { inplace: false });
        return this.updateParagraph(x, profileID, d);
    }

    static async getParagraphs(x, profileID) {
        return (await TokenProfile.getProfile(x, profileID))?.paragraphs;
    }

    static async getParagraph(x, profileID, paragraphID) {
        return (await TokenProfile.getParagraphs(x, profileID))[paragraphID];
    }

    static async getParagraphContent(x, profileID, paragraphID, viewer) {
        const paragraph = await TokenProfile.getParagraph(x, profileID, paragraphID);
        if (!paragraph || !paragraph.id?.length) return '';
        if (!(await TokenProfile.canSeeParagraphData(x, paragraph, viewer))) return '';
        let content = `<div ${TokenProfile.getParagraphClasses(paragraph)}>${paragraph.text}</div>`;
        return content;
    }

    static getParagraphClasses(paragraph) {
        let c = 'class="tpt-p';
        for (let t of paragraph.tags_self.split(',')) {
            t = TokenProfile.safecss(t);
            if (t?.length) {
                c += ' tpt-ts-' + t;
            }
        }
        for (let t of paragraph.tags_viewer.split(',')) {
            t = TokenProfile.safecss(t);
            if (t?.length) {
                c += ' tpt-tv-' + t;
            }
        }
        return c + '" id="' + paragraph.id + '"';
    }

    static async updateParagraph(x, profileID, data) {
        if (!x || !profileID || !data) return undefined;
        const actor = await TokenProfile.getActor(x);
        if (!actor || !actor.isOwner) return undefined;
        const profile = await TokenProfile.getProfile(actor, profileID);
        if (!profile) return undefined;

        if (!data.id) {
            data.id = foundry.utils.randomID();
            if (profile.paragraphs && profile.paragraphs[data.id]) {
                console.log('TokenProfile: ID collision when creating paragraph with ID', data.id,
                    'for profile', profile, 'on actor', actor);
                return false;
            }
        }

        if (!data.id || !data.id.length) return undefined;

        await actor.setFlag('tokenprofile', 'profiles.' + profileID + '.paragraphs.' + data.id, data);
        return TokenProfile.getParagraph(actor, profileID, data.id);
    }

    static async overwriteParagraphs(x, profileID, data) {
        if (!x || !profileID || !data) return undefined;
        const actor = await TokenProfile.getActor(x);
        if (!actor || !actor.isOwner) return false;
        const profile = await TokenProfile.getProfile(actor, profileID);
        if (!profile) return undefined;
        await actor.unsetFlag('tokenprofile', 'profiles.' + profileID + '.paragraphs');
        await actor.setFlag('tokenprofile', 'profiles.' + profileID + '.paragraphs', data);
    }

    static async removeParagraph(x, profileID, paragraphID) {
        if (!x || !profileID || !paragraphID) return undefined;
        const actor = await TokenProfile.getActor(x);
        if (!actor || !actor.isOwner) return false;
        const profile = await TokenProfile.getProfile(actor, profileID);
        if (!profile) return undefined;
        return actor.unsetFlag('tokenprofile', 'profiles.' + profileID + '.paragraphs.' + paragraphID);
    }

    static getObjectI18NPrefix(o, prefix, options = {}) {
        if (!o) return [];

        const opt = mergeObject({
            settings: false,
            skipKeys: {}
        }, options, { inplace: false });

        if (opt.settings) {
            var out = {};
            for (const k in o) {
                var val = o[k];
                if (!val || k in opt.skipKeys) continue;
                out[val] = game.i18n.localize(prefix + val);
            }
            return out;
        }

        return Object.entries(o)
            .map(([key, value]) => {
                return { value: value, label: game.i18n.localize(prefix + value) };
            });
    }

    static async getActorName(actor) {
        if (!actor) return '';

        let name = ChatMessage?.getSpeaker({ actor: actor })?.alias ?? (actor.name ?? actor.documentName);

        if (!game.user.isGM) {
            name = actor.token?.name ?? actor.prototypeToken?.name;
            let anon = game.modules.get('anonymous')?.api;
            let nameVisible = await anon?.playersSeeName(actor);
            if (anon && !nameVisible) {
                return anon.getName(actor);
            }
        }

        return name;
    }

    static getPatternInputFilter(pattern) {
        return `oninput="this.value = this.value.replace(/[^${pattern}]/, '')"`
    }

    static getTagNameFilter() {
        if (!TokenProfile.TAG_NAME_FORCE_LOWER) {
            return TokenProfile.getPatternInputFilter(TokenProfile.TAG_NAME_PATTERN);
        }
        return `oninput="this.value = String(this.value.replace(/[^${TokenProfile.TAG_NAME_PATTERN}]/, '')).toLowerCase()"`
    }

    static async confirmDeletion() {
        return await DialogV2.confirm({
            window: { title: 'Confirm' },
            content: game.i18n.localize('TokenProfile.confirmdelete'),
            yes: {
                label: 'Delete',
            },
            modal: true,
            rejectClose: false,
        });
    }

    static async getText(title, ok, maxlen, pattern = '', placeholder = '', value = '') {
        let validate = '';
        if (pattern && pattern.length) {
            validate = TokenProfile.getPatternInputFilter(pattern);
        }

        var text = await DialogV2.prompt({
            window: { title: title },
            content: `<input name="text" type="text" maxlength="${maxlen}" ${validate}
                placeholder="${placeholder}" value="${value}" required autofocus
                onfocus="this.value = this.value; this.setSelectionRange(-1, -1);">`, // Ensure cursor is at end.
            modal: true,
            ok: {
                label: ok,
                callback: (_, button) => button.form.elements.text.value
            },
            default: 'Submit',
            close: () => '',
        });

        return text;
    }

    static safecss(s) {
        return encodeURIComponent(s).toLowerCase().replace(/\.|%[0-9a-z]{2}/gi, '');
    }
}

class TokenProfileEditor extends FormApplication {
    editingProfileID = '';
    editorTitle = '';

    constructor(object, options) {
        super(object, options);
        this.object.apps[this.appId] = this;
    }

    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            template: 'modules/tokenprofile/templates/tokenprofile-edit.html',
            width: '600',
            height: '700',
            classes: ['tokenprofile', 'sheet'],
            title: game.i18n.localize('TokenProfile.profile.title.default'),
            resizable: true,
            editable: true,
            submitOnClose: true,
            submitOnUnfocus: true,
            submitOnChange: true,
            closeOnSubmit: false
        });
    }

    static buildProfileSelect(data) {
        let out = `<select name="id" data-tooltip="TokenProfile.tt.profiles"`;
        let disabled = false;
        if (data?.noProfile || !data?.profiles) {
            out += ' disabled';
            disabled = true;
        }
        out += '>\n';
        if (disabled) {
            out += '</select>';
            return out;
        }

        for (const key of Object.keys(data.profiles)) {
            const p = data.profiles[key];
            let add = '';
            if (p.id == data.editingProfileID) {
                add += ' selected';
            }
            if (p.enabled) {
                add += ' class="tp-psel-enabled"'
            }
            out += `    <option value="${p.id}"${add}>${p.name}</option>\n`;
        }

        out += '</select>';
        return out;
    }

    async getData() {
        var data = super.getData();

        await this.switchEditingProfile(this.editingProfileID);

        data.editingProfileID = this.editingProfileID;
        data.editingProfile = await this.getEditingProfile();
        data.paragraphs = data.editingProfile?.paragraphs ?? {};
        data.hasNoParagraphs = !(data.paragraphs && Object.keys(data.paragraphs)?.length);
        data.noProfile = !(data.editingProfile?.id);
        data.canSeeProfile = this.canSeeProfile(this.editingProfileID);
        data.canEditProfile = this.canEditProfile(this.editingProfileID);
        data.enabled = data.editingProfile?.enabled ?? false;
        data.randomize = await TokenProfile.getFlag(data.object, 'randomize');

        data.actor = await TokenProfile.getActor(data.object);

        data.visibilityOptions = TokenProfile.getObjectI18NPrefix(TokenProfile.VISIBILITY, 'TokenProfile.visibility.');
        data.flags = this.object.flags;
        data.isOwner = this.object.isOwner;
        data.owner = game.user.id;
        data.isGM = game.user.isGM;

        data.taggerEnabled = typeof Tagger !== 'undefined';
        data.tagNameFilter = TokenProfile.getTagNameFilter();

        data.profiles = await TokenProfile.getProfiles(data.actor);
        data.profileSelectionHTML = TokenProfileEditor.buildProfileSelect(data);

        data.tutorial = '';
        if (data.isOwner) {
            if (data.noProfile) {
                data.tutorial = game.i18n.format('TokenProfile.tutorial.profile',
                    { button: '<i class="fas fa-file-plus"></i>' });
            } else if (data.hasNoParagraphs) {
                data.tutorial = game.i18n.format('TokenProfile.tutorial.paragraphs',
                    { profile: data.editingProfile?.name, button: '<i class="fas fa-plus-large"></i>' });
            }
        }

        data = await this._enrichData(data);
        return data;
    }

    async _enrichData(data) {
        for (const id in data.paragraphs) {
            data.paragraphs[id].textEnriched = data.paragraphs[id]?.text?.length ?
                await TextEditor.enrichHTML(
                    data.paragraphs[id]?.text,
                    { secrets: this.object.isOwner, relativeTo: this.object }
                ) : '';
        }
        return data;
    }

    static _attachHeaderButton(app, buttons) {
        if (!game.settings.get('tokenprofile', 'headerbutton.enabled')) return;
        if (!(app instanceof ActorSheet)) return;
        if (!(app.document instanceof foundry.abstract.Document)) return;
        if (!TokenProfileEditor.canSeeHeaderButton(app.document)) return;

        const button = {
            tooltip: game.i18n.localize('TokenProfile.label'),
            class: 'tokenprofile-open',
            get icon() {
                let notes = app.document.getFlag('tokenprofile', 'notes');
                return `fas ${notes ? 'fa-address-card' : 'fa-address-card'}`;
            },
            onclick: (ev) => {
                TokenProfileEditor.open(app.document);
            },
        };
        buttons.unshift(button);
    }

    static open(doc) {
        if (!doc || !TokenProfileEditor.canSeeHeaderButton(doc)) return;
        new TokenProfileEditor(doc).render(true);
    }

    static _updateHeaderButton(app, [elem], options) {
        if (!game.settings.get('tokenprofile', 'headerbutton.enabled')) return;
        if (!(app instanceof ActorSheet)) return;
        if (!(app.document instanceof foundry.abstract.Document)) return;
        if (!TokenProfileEditor.canSeeHeaderButton(app.document)) return;

        let button = elem?.closest('.window-app')?.querySelector('.tokenprofile-open');
        if (!button) return;

        let delay = 150;
        setTimeout(async () => {
            const profiles = await TokenProfile.getProfiles(app.document);
            if (!game.settings.get('tokenprofile', 'headerbutton.color') || !profiles || !Object.keys(profiles).length) {
                button.style.color = '';
                return;
            }

            const enabled = await TokenProfile.getVisibleProfiles(app.document, undefined);
            if (enabled && Object.keys(enabled).length) {
                button.style.color = 'var(--palette-success, green)';
                return;
            }

            button.style.color = 'var(--palette-warning, yellow)';
        }, delay);
    }

    async canEditProfile(id) {
        if (!id || !id.length) return false;
        return TokenProfileEditor.canSeeHeaderButton(this.object);
    }

    async canSeeProfile(id) {
        return this.canEditProfile(id);
    }

    static canSeeHeaderButton(doc) {
        if (!doc?.isOwner) return false;
        if (!game.user.isGM) {
            const required = game.settings.get('tokenprofile', 'players.edit');
            if (required && game.user.role < required) return false;
        }
        
        return true;
    }

    async activateListeners(html) {
        super.activateListeners(html);

        const profileSelect = html.find('.profile-select select');
        profileSelect?.change(async (ev) => {
            ev.preventDefault();
            await this.switchEditingProfile(profileSelect?.val());
            this.render();
        });

        html.find('.profile-select #add')?.click(async (ev) => {
            ev.preventDefault();
            await this.addProfile();
            await this.switchEditingProfile(this.editingProfileID);
            this.render(true);
            setTimeout(() => {
                this.render(true);
            }, 150);
        });

        html.find('.profile-select #copy')?.click(async (ev) => {
            ev.preventDefault();
            await this.addProfile(true);
            await this.switchEditingProfile(this.editingProfileID);
            this.render(true);
            setTimeout(() => {
                this.render(true);
            }, 150);
        });

        html.find('.profile-select #rename')?.click(async (ev) => {
            ev.preventDefault();
            if (await this.renameProfile()) {
                this.render();
            }
        });

        html.find('.profile-select #delete')?.click(async (ev) => {
            ev.preventDefault();
            if (await this.removeProfile()) {
                this.render();
            }
        });

        html.find('.tokenprofile-form-meta #post')?.click(async (ev) => {
            ev.preventDefault();
            if (await this.postProfile()) {
                this.render();
            }
        });

        html.find('article .controls #p-add')?.click(async (ev) => {
            ev.preventDefault();
            if (await this.addParagraph()) {
                this.render();
            }
        });

        html.find('article fieldset .controls #p-up')?.click(async (ev) => {
            ev.preventDefault();
            const pid = ev.currentTarget?.dataset?.pid;
            if (pid && await this.moveParagraphUp(pid)) {
                this.render();
            }
        });

        html.find('article fieldset .controls #p-down')?.click(async (ev) => {
            ev.preventDefault();
            const pid = ev.currentTarget?.dataset?.pid;
            if (pid && await this.moveParagraphDown(pid)) {
                this.render();
            }
        });

        html.find('article fieldset .controls #p-del')?.click(async (ev) => {
            ev.preventDefault();
            const pid = ev.currentTarget?.dataset?.pid;
            if (pid && await this.removeParagraph(pid)) {
                this.render();
            }
        });

        html.find('article fieldset .controls #p-post')?.click(async (ev) => {
            ev.preventDefault();
            const pid = ev.currentTarget?.dataset?.pid;
            if (pid && await this.postParagraph(pid)) {
                this.render();
            }
        });
    }

    get title() {
        return this.editorTitle;
    }

    async addParagraph() {
        return TokenProfile.addParagraph(this.object, this.editingProfileID, {});
    }

    async moveParagraphUp(paragraphID) {
        const paragraphs = await TokenProfile.getParagraphs(this.object, this.editingProfileID);
        if (!paragraphs || !(paragraphID in paragraphs)) return;
        const before = TokenProfile.getPreviousKey(paragraphs, paragraphID);
        const before2 = TokenProfile.getPreviousKey(paragraphs, before);
        const moved = TokenProfile.reorderObject(paragraphs, paragraphID, before2);
        return TokenProfile.overwriteParagraphs(this.object, this.editingProfileID, moved);
    }

    async moveParagraphDown(paragraphID) {
        const paragraphs = await TokenProfile.getParagraphs(this.object, this.editingProfileID);
        if (!paragraphs || !(paragraphID in paragraphs)) return;
        const after = TokenProfile.getNextKey(paragraphs, paragraphID);
        const moved = TokenProfile.reorderObject(paragraphs, paragraphID, after);
        return TokenProfile.overwriteParagraphs(this.object, this.editingProfileID, moved);
    }

    async removeParagraph(paragraphID) {
        const content = await TokenProfile.getParagraph(this.object, this.editingProfileID, paragraphID);
        if (content?.text?.length && !(await TokenProfile.confirmDeletion())) {
            return;
        }
          
        return TokenProfile.removeParagraph(this.object, this.editingProfileID, paragraphID);
    }

    async postParagraph(paragraphID) {
        return TokenProfile.postParagraph(this.object, this.editingProfileID, paragraphID);
    }

    async addProfile(copyCurrent = false, name = '', switchProfile = true) {
        if (!name || !name.length) {
            name = await TokenProfile.getText(
                'TokenProfile.profile.create.title',
                'TokenProfile.profile.create.submit',
                TokenProfile.PROFILE_NAME_MAX_LEN,
                TokenProfile.PROFILE_NAME_PATTERN,
                game.i18n.localize('TokenProfile.profile.create.title'),
                game.i18n.localize('TokenProfile.profile.new')
            );
        }

        if (!name) {
            return undefined;
        }

        var data = {}
        if (copyCurrent) {
            const profile = await TokenProfile.getProfile(this.object, this.editingProfileID);
            if (profile && profile?.id?.length) {
                for (const key of Object.keys(profile)) {
                    if (key === "id") continue;
                    data[key] = profile[key];
                }
            }
        }
        data.name = name;

        const added = await TokenProfile.addProfile(this.object, data);
        if (switchProfile) {
            await this.switchEditingProfile(added?.id);
        }

        return added;
    }

    async removeProfile(id = '', switchProfile = true) {
        if (!id) {
            id = this.editingProfileID;
            if (!id || !(await this.getEditingProfile())) return false;
        }

        const profile = await TokenProfile.getProfile(this.object, id);
        if (!profile || !profile?.id?.length) return;

        if (profile?.paragraphs && Object.keys(profile.paragraphs).length && !(await TokenProfile.confirmDeletion())) {
            return;
        }

        const ret = await TokenProfile.removeProfile(this.object, id);
        if (switchProfile) {
            await this.switchEditingProfile();
        }
        return ret;
    }

    async postProfile() {
        return TokenProfile.postProfile(this.object, this.editingProfileID);
    }

    async renameProfile(id = '', new_name = '') {
        if (!id) {
            id = this.editingProfileID;
            if (!id) return false;
        }

        const profile = await TokenProfile.getProfile(this.object, id);
        if (!profile || !profile.id?.length || !profile.name?.length) return false;

        if (!new_name || !new_name.length) {
            new_name = await TokenProfile.getText(
                'TokenProfile.profile.create.title',
                'TokenProfile.profile.create.submit',
                TokenProfile.PROFILE_NAME_MAX_LEN,
                TokenProfile.PROFILE_NAME_PATTERN,
                game.i18n.localize('TokenProfile.profile.create.title'),
                profile.name ?? ''
            );
        }

        if (!new_name.length || !profile.name?.length || profile.name === new_name) return false;
        return TokenProfile.updateProfile(this.object, { id: profile.id, name: new_name });
    }

    async getEditingProfile() {
        if (!this.editingProfileID) return undefined;

        return TokenProfile.getProfile(this.object, this.editingProfileID);
    }

    async switchEditingProfile(id = '') {
        if (id && id === this.editingProfileID) return;

        if (!id) {
            id = '';
        }

        if (!id && !(await this.getEditingProfile())) {
            const profiles = await TokenProfile.getProfiles(this.object);
            if (profiles && Object.keys(profiles).length) {
                id = Object.keys(profiles)[0];
            }
        }

        this.editingProfileID = id;
        const profile = await this.getEditingProfile();
        if (TokenProfile.LOG) {
            console.log('TokenProfile: Switching editor to profile', id, profile);
        }

        // Update title
        const actorName = await TokenProfile.getActorName(this.object);
        if (profile?.name) {
            const displayName = game.i18n.format('TokenProfile.profile.name', { name: profile.name });
            this.editorTitle = game.i18n.format('TokenProfile.profile.title.profile', { profile: displayName, actor: actorName });
        } else {
            this.editorTitle = game.i18n.format('TokenProfile.profile.title.actor', { actor: actorName });
        }
    }

    async _updateObject(event, data) {
        if (!this.canEditProfile()) return;
        if (data.id !== this.editingProfileID) return;

        await this.updateGlobal(data, 'randomize');
        return TokenProfile.updateProfile(this.object, data);
    }

    async updateGlobal(data, key) {
        if (this.object && data && key in data) {
            const actor = await TokenProfile.getActor(this.object);
            if (actor) {
                await actor.setFlag('tokenprofile', key, data[key]);
            }
        }
        if (key in data) {
            delete data[key];
        }
    }

    static registerHooks() {
        const watchedHooks = ['ActorSheet'];
        watchedHooks.forEach(hook => {
            Hooks.on(`get${hook}HeaderButtons`, TokenProfileEditor._attachHeaderButton);
            Hooks.on(`render${hook}`, TokenProfileEditor._updateHeaderButton);
        });
    }
}

class TokenProfileTooltip {
    static POSITIONS = {
        AUTO: 'auto',
        TOKEN_LEFT: 'token_left',
        TOKEN_RIGHT: 'token_right'
    };

    static tooltips = [];

    static async show(token) {
        if (!game.user.isGM) {
            const required = game.settings.get('tokenprofile', 'tooltip.players.see');
            if (required && game.user.role < required) return;
        }

        const display = await TokenProfile.getProfileForDisplay(token, TokenProfile.getViewer());
        var content = await TokenProfile.getProfileContent(token, display?.id, TokenProfile.getViewer());
        content = await TokenProfileTooltip.addGMNotes(token, content);

        const data = { token, content }
        Hooks.callAll('tokenprofile.tooltip', data);

        if (!data.content.length) return;

        const enriched = await TextEditor.enrichHTML(
            `<div class="tpt-container">${data.content}</div>`,
            { secrets: data.token.isOwner, relativeTo: data.token }
        );

        TokenProfileTooltip.dismissTooltips();
        const position = TokenProfileTooltip.getPositionForToken(data.token);

        const t = game.tooltip.createLockedTooltip(position, enriched, {
            cssClass: TokenProfileTooltip._get_tooltip_css_classes(token)
        });
        TokenProfileTooltip.tooltips.push(t);
    }

    static async addGMNotes(token, content) {
        if (!game.user.isGM) return content;
        if (!game.settings.get('tokenprofile', 'mod.gmnotes.tooltip')) return content;
        const actor = await TokenProfile.getActor(token);
        if (!actor?.flags || !('gm-notes' in actor.flags) || !actor.flags['gm-notes']?.notes?.length) return content;
        return content + '<div class="tp-gm-notes">' + actor.flags['gm-notes']?.notes + '</div>';
    }

    static dismissTooltips() {
        if (!TokenProfileTooltip.tooltips || !TokenProfileTooltip.tooltips.length) return;
        for (var i = TokenProfileTooltip.tooltips.length - 1; i >= 0; i--) {
            game.tooltip.dismissLockedTooltip(TokenProfileTooltip.tooltips[i]);
            TokenProfileTooltip.tooltips.splice(i, 1);
        }
    }

    static getPositionForToken(t) {
        var position = game.settings.get('tokenprofile', 'tooltip.position');
        if (position !== TokenProfileTooltip.POSITIONS.TOKEN_LEFT &&
            position !== TokenProfileTooltip.POSITIONS.TOKEN_RIGHT) {
            position = TokenProfileTooltip.POSITIONS.AUTO;
        }

        const tokenMargin = TooltipManager.TOOLTIP_MARGIN_PX;
        const sceneWidth = game.canvas.screenDimensions[0] ?? 1;
        const sceneHeight = game.canvas.screenDimensions[1] ?? 1; 
        const sceneScaleX = (game.canvas.stage?.scale.x ?? 1)
        const sceneScaleY = (game.canvas.stage?.scale.y ?? 1)
        const tokenWidth = t.bounds.width * sceneScaleX;
        const tokenHeight = t.bounds.height * sceneScaleY;

        var x = t.worldTransform.tx;
        var y = t.worldTransform.ty;

        var pos_out = {};

        if (y < (sceneHeight/2)) {
            pos_out['top'] = `${y}px`;
        } else {
            y = (sceneHeight - y) - tokenHeight;
            pos_out['bottom'] = `${y}px`;
        }

        if (position == TokenProfileTooltip.POSITIONS.AUTO) {
            if (x > (sceneWidth /2)) {
                position = TokenProfileTooltip.POSITIONS.TOKEN_LEFT;
            } else {
                position = TokenProfileTooltip.POSITIONS.TOKEN_RIGHT;
            }
        }

        if (position == TokenProfileTooltip.POSITIONS.TOKEN_LEFT) {
            x = (sceneWidth - x) + tokenMargin;
            pos_out['right'] = `${x}px`;
        } else if (position == TokenProfileTooltip.POSITIONS.TOKEN_RIGHT) {
            x += tokenWidth + tokenMargin;
            pos_out['left'] = `${x}px`;
        }

        return pos_out;
    }

    static _get_tooltip_css_classes(token) {
        let c = 'tokenprofile-tooltip';
        if (game.system?.id?.length) {
            c += ' tpt-' + TokenProfile.safecss(game.system.id);
        }
        if (token?.actor?.id?.length) {
            c += ' tpt-actor-' + TokenProfile.safecss(token.actor.id);
        }

        return c;
    }

    static registerHooks() {
        Hooks.on('hoverToken', async function (token, hovered) {
            if (hovered) {
                TokenProfileTooltip.show(token);
            }
        });
    }
}

function getUserRolesI18N() {
    const roles = {};
    for (const k of Object.keys(CONST.USER_ROLE_NAMES)) {
        const v = CONST.USER_ROLE_NAMES[k];
        const cap = v.charAt(0).toUpperCase() + v.slice(1).toLowerCase();
        roles[k] = 'USER.Role' + cap;
    }
    return roles;
}

Hooks.once('init', async function () {
    game.settings.register('tokenprofile', 'default.visibility', {
        name: 'TokenProfile.settings.visibility.default.name',
        hint: 'TokenProfile.settings.visibility.default.hint',
        config: true,
        default: TokenProfile.VISIBILITY.SHOW_IF_NOT_SECRET,
        scope: 'world',
        type: new foundry.data.fields.StringField({
            choices: TokenProfile.getObjectI18NPrefix(TokenProfile.VISIBILITY,
                'TokenProfile.visibility.', { 'settings': true, skipKeys: {'DEFAULT': true} })
        }),
    });

    game.settings.register('tokenprofile', 'players.edit', {
        name: 'TokenProfile.settings.players.edit.name',
        hint: 'TokenProfile.settings.players.edit.hint',
        config: true,
        default: CONST.USER_ROLES.ASSISTANT,
        scope: 'world',
        type: Number,
        choices: getUserRolesI18N()
    });

    game.settings.register('tokenprofile', 'tooltip.players.see', {
        name: 'TokenProfile.settings.tooltip.players.see.name',
        hint: 'TokenProfile.settings.tooltip.players.see.hint',
        config: true,
        default: CONST.USER_ROLES.PLAYER,
        scope: 'world',
        type: Number,
        choices: getUserRolesI18N()
    });

    game.settings.register('tokenprofile', 'tooltip.position', {
        name: 'TokenProfile.settings.tooltip.position.name',
        hint: 'TokenProfile.settings.tooltip.position.hint',
        config: true,
        default: TokenProfileTooltip.POSITIONS.AUTO,
        scope: 'world',
        type: new foundry.data.fields.StringField({
            choices: TokenProfile.getObjectI18NPrefix(TokenProfileTooltip.POSITIONS,
                'TokenProfile.settings.tooltip.position.', { 'settings': true })
        }),
    });

    game.settings.register('tokenprofile', 'mod.gmnotes.tooltip', {
        name: 'TokenProfile.settings.mod.gmnotes.tooltip.name',
        hint: 'TokenProfile.settings.mod.gmnotes.tooltip.hint',
        config: true,
        default: false,
        scope: 'world',
        type: Boolean
    });

    game.settings.register('tokenprofile', 'mod.perceptive.enabled', {
        name: 'TokenProfile.settings.mod.perceptive.enabled.name',
        hint: 'TokenProfile.settings.mod.perceptive.enabled.hint',
        config: true,
        default: true,
        scope: 'world',
        type: Boolean
    });

    game.settings.register('tokenprofile', 'headerbutton.enabled', {
        name: 'TokenProfile.settings.headerbutton.enabled.name',
        hint: 'TokenProfile.settings.headerbutton.enabled.hint',
        config: true,
        default: true,
        scope: 'world',
        type: Boolean
    });

    game.settings.register('tokenprofile', 'headerbutton.color', {
        name: 'TokenProfile.settings.headerbutton.color.name',
        hint: 'TokenProfile.settings.headerbutton.color.hint',
        config: true,
        default: true,
        scope: 'client',
        type: Boolean
    });

    game.settings.register('tokenprofile', 'tooltip.enabled', {
        name: 'TokenProfile.settings.tooltip.enabled.name',
        hint: 'TokenProfile.settings.tooltip.enabled.hint',
        config: true,
        default: true,
        scope: 'client',
        type: Boolean
    });

    if (game?.modules?.get('tokenprofile')) {
        game.modules.get('tokenprofile').api = TokenProfile;
    }

    TokenProfileEditor.registerHooks();
    TokenProfileTooltip.registerHooks();
});
