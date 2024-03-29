(function () {
    function MainController($scope, $rootScope, $location, $routeParams, $timeout, $http, $log, appState, treeService, notificationsService, userService, navigationService, historyService, updateChecker, assetsService, eventsService, umbRequestHelper, tmhDynamicLocale, localStorageService, tourService) {
        //the null is important because we do an explicit bool check on this in the view
        //the avatar is by default the umbraco logo    
        $scope.authenticated = null;
        $scope.avatar = [
            { value: 'assets/img/application/logo.png' },
            { value: 'assets/img/application/logo@2x.png' },
            { value: 'assets/img/application/logo@3x.png' }
        ];
        $scope.touchDevice = appState.getGlobalState('touchDevice');
        $scope.removeNotification = function (index) {
            notificationsService.remove(index);
        };
        $scope.closeDialogs = function (event) {
            //only close dialogs if non-link and non-buttons are clicked
            var el = event.target.nodeName;
            var els = [
                'INPUT',
                'A',
                'BUTTON'
            ];
            if (els.indexOf(el) >= 0) {
                return;
            }
            var parents = $(event.target).parents('a,button');
            if (parents.length > 0) {
                return;
            }
            //SD: I've updated this so that we don't close the dialog when clicking inside of the dialog
            var nav = $(event.target).parents('#dialog');
            if (nav.length === 1) {
                return;
            }
            eventsService.emit('app.closeDialogs', event);
        };
        var evts = [];
        //when a user logs out or timesout
        evts.push(eventsService.on('app.notAuthenticated', function () {
            $scope.authenticated = null;
            $scope.user = null;
        }));
        evts.push(eventsService.on('app.userRefresh', function (evt) {
            userService.refreshCurrentUser().then(function (data) {
                $scope.user = data;
                //Load locale file
                if ($scope.user.locale) {
                    tmhDynamicLocale.set($scope.user.locale);
                }
                if ($scope.user.avatars) {
                    $scope.avatar = [];
                    if (angular.isArray($scope.user.avatars)) {
                        for (var i = 0; i < $scope.user.avatars.length; i++) {
                            $scope.avatar.push({ value: $scope.user.avatars[i] });
                        }
                    }
                }
            });
        }));
        //when the app is ready/user is logged in, setup the data
        evts.push(eventsService.on('app.ready', function (evt, data) {
            $scope.authenticated = data.authenticated;
            $scope.user = data.user;
            updateChecker.check().then(function (update) {
                if (update && update !== 'null') {
                    if (update.type !== 'None') {
                        var notification = {
                            headline: 'Update available',
                            message: 'Click to download',
                            sticky: true,
                            type: 'info',
                            url: update.url
                        };
                        notificationsService.add(notification);
                    }
                }
            });
            //if the user has changed we need to redirect to the root so they don't try to continue editing the
            //last item in the URL (NOTE: the user id can equal zero, so we cannot just do !data.lastUserId since that will resolve to true)
            if (data.lastUserId !== undefined && data.lastUserId !== null && data.lastUserId !== data.user.id) {
                $location.path('/').search('');
                historyService.removeAll();
                treeService.clearCache();
                //if the user changed, clearout local storage too - could contain sensitive data
                localStorageService.clearAll();
            }
            //if this is a new login (i.e. the user entered credentials), then clear out local storage - could contain sensitive data
            if (data.loginType === 'credentials') {
                localStorageService.clearAll();
            }
            //Load locale file
            if ($scope.user.locale) {
                tmhDynamicLocale.set($scope.user.locale);
            }
            if ($scope.user.avatars) {
                $scope.avatar = [];
                if (angular.isArray($scope.user.avatars)) {
                    for (var i = 0; i < $scope.user.avatars.length; i++) {
                        $scope.avatar.push({ value: $scope.user.avatars[i] });
                    }
                }
            }
        }));
        evts.push(eventsService.on('app.ysod', function (name, error) {
            $scope.ysodOverlay = {
                view: 'ysod',
                error: error,
                show: true
            };
        }));
        // manage the help dialog by subscribing to the showHelp appState
        $scope.drawer = {};
        evts.push(eventsService.on('appState.drawerState.changed', function (e, args) {
            // set view
            if (args.key === 'view') {
                $scope.drawer.view = args.value;
            }
            // set custom model
            if (args.key === 'model') {
                $scope.drawer.model = args.value;
            }
            // show / hide drawer
            if (args.key === 'showDrawer') {
                $scope.drawer.show = args.value;
            }
        }));
        evts.push(eventsService.on('appState.tour.start', function (name, args) {
            $scope.tour = args;
            $scope.tour.show = true;
        }));
        evts.push(eventsService.on('appState.tour.end', function () {
            $scope.tour = null;
        }));
        evts.push(eventsService.on('appState.tour.complete', function () {
            $scope.tour = null;
        }));
        evts.push(eventsService.on('appState.backdrop', function (name, args) {
            $scope.backdrop = args;
        }));
        //ensure to unregister from all events!
        $scope.$on('$destroy', function () {
            for (var e in evts) {
                eventsService.unsubscribe(evts[e]);
            }
        });
    }
    //register it
    angular.module('umbraco').controller('Umbraco.MainController', MainController).config(function (tmhDynamicLocaleProvider) {
        //Set url for locale files
        tmhDynamicLocaleProvider.localeLocationPattern('lib/angular/1.1.5/i18n/angular-locale_{{locale}}.js');
    });
    /**
 * @ngdoc controller
 * @name Umbraco.NavigationController
 * @function
 *
 * @description
 * Handles the section area of the app
 *
 * @param {navigationService} navigationService A reference to the navigationService
 */
    function NavigationController($scope, $rootScope, $location, $log, $routeParams, $timeout, appState, navigationService, keyboardService, dialogService, historyService, eventsService, sectionResource, angularHelper) {
        //TODO: Need to think about this and an nicer way to achieve what this is doing.
        //the tree event handler i used to subscribe to the main tree click events
        $scope.treeEventHandler = $({});
        navigationService.setupTreeEvents($scope.treeEventHandler);
        //Put the navigation service on this scope so we can use it's methods/properties in the view.
        // IMPORTANT: all properties assigned to this scope are generally available on the scope object on dialogs since
        //   when we create a dialog we pass in this scope to be used for the dialog's scope instead of creating a new one.
        $scope.nav = navigationService;
        // TODO: Lets fix this, it is less than ideal to be passing in the navigationController scope to something else to be used as it's scope,
        // this is going to lead to problems/confusion. I really don't think passing scope's around is very good practice.
        $rootScope.nav = navigationService;
        //set up our scope vars
        $scope.showContextMenuDialog = false;
        $scope.showContextMenu = false;
        $scope.showSearchResults = false;
        $scope.menuDialogTitle = null;
        $scope.menuActions = [];
        $scope.menuNode = null;
        $scope.currentSection = appState.getSectionState('currentSection');
        $scope.showNavigation = appState.getGlobalState('showNavigation');
        //trigger search with a hotkey:
        keyboardService.bind('ctrl+shift+s', function () {
            navigationService.showSearch();
        });
        //trigger dialogs with a hotkey:
        keyboardService.bind('esc', function () {
            eventsService.emit('app.closeDialogs');
        });
        $scope.selectedId = navigationService.currentId;
        var evts = [];
        //Listen for global state changes
        evts.push(eventsService.on('appState.globalState.changed', function (e, args) {
            if (args.key === 'showNavigation') {
                $scope.showNavigation = args.value;
            }
        }));
        //Listen for menu state changes
        evts.push(eventsService.on('appState.menuState.changed', function (e, args) {
            if (args.key === 'showMenuDialog') {
                $scope.showContextMenuDialog = args.value;
            }
            if (args.key === 'showMenu') {
                $scope.showContextMenu = args.value;
            }
            if (args.key === 'dialogTitle') {
                $scope.menuDialogTitle = args.value;
            }
            if (args.key === 'menuActions') {
                $scope.menuActions = args.value;
            }
            if (args.key === 'currentNode') {
                $scope.menuNode = args.value;
            }
        }));
        //Listen for section state changes
        evts.push(eventsService.on('appState.treeState.changed', function (e, args) {
            var f = args;
            if (args.value.root && args.value.root.metaData.containsTrees === false) {
                $rootScope.emptySection = true;
            } else {
                $rootScope.emptySection = false;
            }
        }));
        //Listen for section state changes
        evts.push(eventsService.on('appState.sectionState.changed', function (e, args) {
            //section changed
            if (args.key === 'currentSection') {
                $scope.currentSection = args.value;
            }
            //show/hide search results
            if (args.key === 'showSearchResults') {
                $scope.showSearchResults = args.value;
            }
        }));
        //This reacts to clicks passed to the body element which emits a global call to close all dialogs
        evts.push(eventsService.on('app.closeDialogs', function (event) {
            if (appState.getGlobalState('stickyNavigation')) {
                navigationService.hideNavigation();
                //TODO: don't know why we need this? - we are inside of an angular event listener.
                angularHelper.safeApply($scope);
            }
        }));
        //when a user logs out or timesout
        evts.push(eventsService.on('app.notAuthenticated', function () {
            $scope.authenticated = false;
        }));
        //when the application is ready and the user is authorized, setup the data
        evts.push(eventsService.on('app.ready', function (evt, data) {
            $scope.authenticated = true;
        }));
        //this reacts to the options item in the tree
        //todo, migrate to nav service
        $scope.searchShowMenu = function (ev, args) {
            //always skip default
            args.skipDefault = true;
            navigationService.showMenu(ev, args);
        };
        //todo, migrate to nav service
        $scope.searchHide = function () {
            navigationService.hideSearch();
        };
        //the below assists with hiding/showing the tree
        var treeActive = false;
        //Sets a service variable as soon as the user hovers the navigation with the mouse
        //used by the leaveTree method to delay hiding
        $scope.enterTree = function (event) {
            treeActive = true;
        };
        // Hides navigation tree, with a short delay, is cancelled if the user moves the mouse over the tree again
        $scope.leaveTree = function (event) {
            //this is a hack to handle IE touch events which freaks out due to no mouse events so the tree instantly shuts down
            if (!event) {
                return;
            }
            if (!appState.getGlobalState('touchDevice')) {
                treeActive = false;
                $timeout(function () {
                    if (!treeActive) {
                        navigationService.hideTree();
                    }
                }, 300);
            }
        };
        //ensure to unregister from all events!
        $scope.$on('$destroy', function () {
            for (var e in evts) {
                eventsService.unsubscribe(evts[e]);
            }
        });
    }
    //register it
    angular.module('umbraco').controller('Umbraco.NavigationController', NavigationController);
    /**
 * @ngdoc controller
 * @name Umbraco.SearchController
 * @function
 * 
 * @description
 * Controls the search functionality in the site
 *  
 */
    function SearchController($scope, searchService, $log, $location, navigationService, $q) {
        $scope.searchTerm = null;
        $scope.searchResults = [];
        $scope.isSearching = false;
        $scope.selectedResult = -1;
        $scope.navigateResults = function (ev) {
            //38: up 40: down, 13: enter
            switch (ev.keyCode) {
            case 38:
                iterateResults(true);
                break;
            case 40:
                iterateResults(false);
                break;
            case 13:
                if ($scope.selectedItem) {
                    $location.path($scope.selectedItem.editorPath);
                    navigationService.hideSearch();
                }
                break;
            }
        };
        var group = undefined;
        var groupNames = [];
        var groupIndex = -1;
        var itemIndex = -1;
        $scope.selectedItem = undefined;
        $scope.clearSearch = function () {
            $scope.searchTerm = null;
        };
        function iterateResults(up) {
            //default group
            if (!group) {
                for (var g in $scope.groups) {
                    if ($scope.groups.hasOwnProperty(g)) {
                        groupNames.push(g);
                    }
                }
                //Sorting to match the groups order
                groupNames.sort();
                group = $scope.groups[groupNames[0]];
                groupIndex = 0;
            }
            if (up) {
                if (itemIndex === 0) {
                    if (groupIndex === 0) {
                        gotoGroup(Object.keys($scope.groups).length - 1, true);
                    } else {
                        gotoGroup(groupIndex - 1, true);
                    }
                } else {
                    gotoItem(itemIndex - 1);
                }
            } else {
                if (itemIndex < group.results.length - 1) {
                    gotoItem(itemIndex + 1);
                } else {
                    if (groupIndex === Object.keys($scope.groups).length - 1) {
                        gotoGroup(0);
                    } else {
                        gotoGroup(groupIndex + 1);
                    }
                }
            }
        }
        function gotoGroup(index, up) {
            groupIndex = index;
            group = $scope.groups[groupNames[groupIndex]];
            if (up) {
                gotoItem(group.results.length - 1);
            } else {
                gotoItem(0);
            }
        }
        function gotoItem(index) {
            itemIndex = index;
            $scope.selectedItem = group.results[itemIndex];
        }
        //used to cancel any request in progress if another one needs to take it's place
        var canceler = null;
        $scope.$watch('searchTerm', _.debounce(function (newVal, oldVal) {
            $scope.$apply(function () {
                $scope.hasResults = false;
                if ($scope.searchTerm) {
                    if (newVal !== null && newVal !== undefined && newVal !== oldVal) {
                        //Resetting for brand new search
                        group = undefined;
                        groupNames = [];
                        groupIndex = -1;
                        itemIndex = -1;
                        $scope.isSearching = true;
                        navigationService.showSearch();
                        $scope.selectedItem = undefined;
                        //a canceler exists, so perform the cancelation operation and reset
                        if (canceler) {
                            canceler.resolve();
                            canceler = $q.defer();
                        } else {
                            canceler = $q.defer();
                        }
                        searchService.searchAll({
                            term: $scope.searchTerm,
                            canceler: canceler
                        }).then(function (result) {
                            //result is a dictionary of group Title and it's results
                            var filtered = {};
                            _.each(result, function (value, key) {
                                if (value.results.length > 0) {
                                    filtered[key] = value;
                                }
                            });
                            $scope.groups = filtered;
                            // check if search has results
                            $scope.hasResults = Object.keys($scope.groups).length > 0;
                            //set back to null so it can be re-created
                            canceler = null;
                            $scope.isSearching = false;
                        });
                    }
                } else {
                    $scope.isSearching = false;
                    navigationService.hideSearch();
                    $scope.selectedItem = undefined;
                }
            });
        }, 200));
    }
    //register it
    angular.module('umbraco').controller('Umbraco.SearchController', SearchController);
    /**
 * @ngdoc controller
 * @name Umbraco.MainController
 * @function
 * 
 * @description
 * The controller for the AuthorizeUpgrade login page
 * 
 */
    function AuthorizeUpgradeController($scope, $window) {
        //Add this method to the scope - this method will be called by the login dialog controller when the login is successful
        // then we'll handle the redirect.
        $scope.submit = function (event) {
            var qry = $window.location.search.trimStart('?').split('&');
            var redir = _.find(qry, function (item) {
                return item.startsWith('redir=');
            });
            if (redir) {
                $window.location = decodeURIComponent(redir.split('=')[1]);
            } else {
                $window.location = '/';
            }
        };
    }
    angular.module('umbraco').controller('Umbraco.AuthorizeUpgradeController', AuthorizeUpgradeController);
    /**
 * @ngdoc controller
 * @name Umbraco.DashboardController
 * @function
 * 
 * @description
 * Controls the dashboards of the application
 * 
 */
    function DashboardController($scope, $routeParams, dashboardResource, localizationService) {
        $scope.page = {};
        $scope.page.nameLocked = true;
        $scope.page.loading = true;
        $scope.dashboard = {};
        localizationService.localize('sections_' + $routeParams.section).then(function (name) {
            $scope.dashboard.name = name;
        });
        dashboardResource.getDashboard($routeParams.section).then(function (tabs) {
            $scope.dashboard.tabs = tabs;
            $scope.page.loading = false;
        });
    }
    //register it
    angular.module('umbraco').controller('Umbraco.DashboardController', DashboardController);
    angular.module('umbraco').controller('Umbraco.Dialogs.ApprovedColorPickerController', function ($scope, $http, umbPropEditorHelper, assetsService) {
        assetsService.loadJs('lib/cssparser/cssparser.js', $scope).then(function () {
            var cssPath = $scope.dialogData.cssPath;
            $scope.cssClass = $scope.dialogData.cssClass;
            $scope.classes = [];
            $scope.change = function (newClass) {
                $scope.model.value = newClass;
            };
            $http.get(cssPath).success(function (data) {
                var parser = new CSSParser();
                $scope.classes = parser.parse(data, false, false).cssRules;
                $scope.classes.splice(0, 0, 'noclass');
            });
            assetsService.loadCss(cssPath, $scope);
        });
    });
    function ContentEditDialogController($scope, editorState, $routeParams, $q, $timeout, $window, appState, contentResource, entityResource, navigationService, notificationsService, angularHelper, serverValidationManager, contentEditingHelper, treeService, fileManager, formHelper, umbRequestHelper, umbModelMapper, $http) {
        $scope.defaultButton = null;
        $scope.subButtons = [];
        var dialogOptions = $scope.$parent.dialogOptions;
        // This is a helper method to reduce the amount of code repitition for actions: Save, Publish, SendToPublish
        function performSave(args) {
            contentEditingHelper.contentEditorPerformSave({
                statusMessage: args.statusMessage,
                saveMethod: args.saveMethod,
                scope: $scope,
                content: $scope.content
            }).then(function (content) {
                //success            
                if (dialogOptions.closeOnSave) {
                    $scope.submit(content);
                }
            }, function (err) {
            });
        }
        function filterTabs(entity, blackList) {
            if (blackList) {
                _.each(entity.tabs, function (tab) {
                    tab.hide = _.contains(blackList, tab.alias);
                });
            }
            return entity;
        }
        ;
        function init(content) {
            var buttons = contentEditingHelper.configureContentEditorButtons({
                create: $routeParams.create,
                content: content,
                methods: {
                    saveAndPublish: $scope.saveAndPublish,
                    sendToPublish: $scope.sendToPublish,
                    save: $scope.save,
                    unPublish: angular.noop
                }
            });
            $scope.defaultButton = buttons.defaultButton;
            $scope.subButtons = buttons.subButtons;
            //This is a total hack but we have really no other way of sharing data to the property editors of this
            // content item, so we'll just set the property on the content item directly
            $scope.content.isDialogEditor = true;
            editorState.set($scope.content);
        }
        //check if the entity is being passed in, otherwise load it from the server
        if (angular.isObject(dialogOptions.entity)) {
            $scope.loaded = true;
            $scope.content = filterTabs(dialogOptions.entity, dialogOptions.tabFilter);
            init($scope.content);
        } else {
            contentResource.getById(dialogOptions.id).then(function (data) {
                $scope.loaded = true;
                $scope.content = filterTabs(data, dialogOptions.tabFilter);
                init($scope.content);
                //in one particular special case, after we've created a new item we redirect back to the edit
                // route but there might be server validation errors in the collection which we need to display
                // after the redirect, so we will bind all subscriptions which will show the server validation errors
                // if there are any and then clear them so the collection no longer persists them.
                serverValidationManager.executeAndClearAllSubscriptions();
            });
        }
        $scope.sendToPublish = function () {
            performSave({
                saveMethod: contentResource.sendToPublish,
                statusMessage: 'Sending...'
            });
        };
        $scope.saveAndPublish = function () {
            performSave({
                saveMethod: contentResource.publish,
                statusMessage: 'Publishing...'
            });
        };
        $scope.save = function () {
            performSave({
                saveMethod: contentResource.save,
                statusMessage: 'Saving...'
            });
        };
        // this method is called for all action buttons and then we proxy based on the btn definition
        $scope.performAction = function (btn) {
            if (!btn || !angular.isFunction(btn.handler)) {
                throw 'btn.handler must be a function reference';
            }
            if (!$scope.busy) {
                btn.handler.apply(this);
            }
        };
    }
    angular.module('umbraco').controller('Umbraco.Dialogs.Content.EditController', ContentEditDialogController);
    angular.module('umbraco').controller('Umbraco.Dialogs.HelpController', function ($scope, $location, $routeParams, helpService, userService, localizationService) {
        $scope.section = $routeParams.section;
        $scope.version = Umbraco.Sys.ServerVariables.application.version + ' assembly: ' + Umbraco.Sys.ServerVariables.application.assemblyVersion;
        if (!$scope.section) {
            $scope.section = 'content';
        }
        $scope.sectionName = $scope.section;
        var rq = {};
        rq.section = $scope.section;
        //translate section name
        localizationService.localize('sections_' + rq.section).then(function (value) {
            $scope.sectionName = value;
        });
        userService.getCurrentUser().then(function (user) {
            rq.lang = user.locale;
            if ($routeParams.url) {
                rq.path = decodeURIComponent($routeParams.url);
                if (rq.path.indexOf(Umbraco.Sys.ServerVariables.umbracoSettings.umbracoPath) === 0) {
                    rq.path = rq.path.substring(Umbraco.Sys.ServerVariables.umbracoSettings.umbracoPath.length);
                }
                if (rq.path.indexOf('.aspx') > 0) {
                    rq.path = rq.path.substring(0, rq.path.indexOf('.aspx'));
                }
            } else {
                rq.path = rq.section + '/' + $routeParams.tree + '/' + $routeParams.method;
            }
            helpService.findHelp(rq).then(function (topics) {
                $scope.topics = topics;
            });
            helpService.findVideos(rq).then(function (videos) {
                $scope.videos = videos;
            });
        });
    });
    //used for the icon picker dialog
    angular.module('umbraco').controller('Umbraco.Dialogs.IconPickerController', function ($scope, iconHelper) {
        iconHelper.getIcons().then(function (icons) {
            $scope.icons = icons;
        });
        $scope.submitClass = function (icon) {
            if ($scope.color) {
                $scope.submit(icon + ' ' + $scope.color);
            } else {
                $scope.submit(icon);
            }
        };
    });
    /**
 * @ngdoc controller
 * @name Umbraco.Dialogs.InsertMacroController
 * @function
 * 
 * @description
 * The controller for the custom insert macro dialog. Until we upgrade the template editor to be angular this 
 * is actually loaded into an iframe with full html.
 */
    function InsertMacroController($scope, entityResource, macroResource, umbPropEditorHelper, macroService, formHelper) {
        /** changes the view to edit the params of the selected macro */
        /** if there is pnly one macro, and it has parameters - editor can skip selecting the Macro **/
        function editParams(insertIfNoParameters) {
            //whether to insert the macro in the rich text editor when editParams is called and there are no parameters see U4-10537 
            insertIfNoParameters = typeof insertIfNoParameters !== 'undefined' ? insertIfNoParameters : true;
            //get the macro params if there are any
            macroResource.getMacroParameters($scope.selectedMacro.id).then(function (data) {
                //go to next page if there are params otherwise we can just exit
                if (!angular.isArray(data) || data.length === 0) {
                    //we can just exist!                  
                    if (insertIfNoParameters) {
                        submitForm();
                    } else {
                        $scope.wizardStep = 'macroSelect';
                    }
                } else {
                    $scope.wizardStep = 'paramSelect';
                    $scope.macroParams = data;
                    //fill in the data if we are editing this macro
                    if ($scope.dialogData && $scope.dialogData.macroData && $scope.dialogData.macroData.macroParamsDictionary) {
                        _.each($scope.dialogData.macroData.macroParamsDictionary, function (val, key) {
                            var prop = _.find($scope.macroParams, function (item) {
                                return item.alias == key;
                            });
                            if (prop) {
                                if (_.isString(val)) {
                                    //we need to unescape values as they have most likely been escaped while inserted 
                                    val = _.unescape(val);
                                    //detect if it is a json string
                                    if (val.detectIsJson()) {
                                        try {
                                            //Parse it to json
                                            prop.value = angular.fromJson(val);
                                        } catch (e) {
                                            // not json
                                            prop.value = val;
                                        }
                                    } else {
                                        prop.value = val;
                                    }
                                } else {
                                    prop.value = val;
                                }
                            }
                        });
                    }
                }
            });
        }
        /** submit the filled out macro params */
        function submitForm() {
            //collect the value data, close the dialog and send the data back to the caller
            //create a dictionary for the macro params
            var paramDictionary = {};
            _.each($scope.macroParams, function (item) {
                var val = item.value;
                if (item.value != null && item.value != undefined && !_.isString(item.value)) {
                    try {
                        val = angular.toJson(val);
                    } catch (e) {
                    }
                }
                //each value needs to be xml escaped!! since the value get's stored as an xml attribute
                paramDictionary[item.alias] = _.escape(val);
            });
            //need to find the macro alias for the selected id
            var macroAlias = $scope.selectedMacro.alias;
            //get the syntax based on the rendering engine
            var syntax;
            if ($scope.dialogData.renderingEngine && $scope.dialogData.renderingEngine === 'WebForms') {
                syntax = macroService.generateWebFormsSyntax({
                    macroAlias: macroAlias,
                    macroParamsDictionary: paramDictionary
                });
            } else if ($scope.dialogData.renderingEngine && $scope.dialogData.renderingEngine === 'Mvc') {
                syntax = macroService.generateMvcSyntax({
                    macroAlias: macroAlias,
                    macroParamsDictionary: paramDictionary
                });
            } else {
                syntax = macroService.generateMacroSyntax({
                    macroAlias: macroAlias,
                    macroParamsDictionary: paramDictionary
                });
            }
            $scope.submit({
                syntax: syntax,
                macroAlias: macroAlias,
                macroParamsDictionary: paramDictionary
            });
        }
        $scope.macros = [];
        $scope.selectedMacro = null;
        $scope.wizardStep = 'macroSelect';
        $scope.macroParams = [];
        $scope.submitForm = function () {
            if (formHelper.submitForm({ scope: $scope })) {
                formHelper.resetForm({ scope: $scope });
                if ($scope.wizardStep === 'macroSelect') {
                    editParams(true);
                } else {
                    submitForm();
                }
            }
        };
        //here we check to see if we've been passed a selected macro and if so we'll set the
        //editor to start with parameter editing
        if ($scope.dialogData && $scope.dialogData.macroData) {
            $scope.wizardStep = 'paramSelect';
        }
        //get the macro list - pass in a filter if it is only for rte
        entityResource.getAll('Macro', $scope.dialogData && $scope.dialogData.richTextEditor && $scope.dialogData.richTextEditor === true ? 'UseInEditor=true' : null).then(function (data) {
            //if 'allowedMacros' is specified, we need to filter
            if (angular.isArray($scope.dialogData.allowedMacros) && $scope.dialogData.allowedMacros.length > 0) {
                $scope.macros = _.filter(data, function (d) {
                    return _.contains($scope.dialogData.allowedMacros, d.alias);
                });
            } else {
                $scope.macros = data;
            }
            //check if there's a pre-selected macro and if it exists
            if ($scope.dialogData && $scope.dialogData.macroData && $scope.dialogData.macroData.macroAlias) {
                var found = _.find(data, function (item) {
                    return item.alias === $scope.dialogData.macroData.macroAlias;
                });
                if (found) {
                    //select the macro and go to next screen
                    $scope.selectedMacro = found;
                    editParams(true);
                    return;
                }
            }
            //if there is only one macro in the site and it has parameters, let's not make the editor choose it from a selection of one macro (unless there are no parameters - then weirdly it's a better experience to make that selection)
            if ($scope.macros.length == 1) {
                $scope.selectedMacro = $scope.macros[0];
                editParams(false);
            } else {
                //we don't have a pre-selected macro so ensure the correct step is set
                $scope.wizardStep = 'macroSelect';
            }
        });
    }
    angular.module('umbraco').controller('Umbraco.Dialogs.InsertMacroController', InsertMacroController);
    /**
 * @ngdoc controller
 * @name Umbraco.Dialogs.LegacyDeleteController
 * @function
 * 
 * @description
 * The controller for deleting content
 */
    function LegacyDeleteController($scope, legacyResource, treeService, navigationService) {
        $scope.performDelete = function () {
            //mark it for deletion (used in the UI)
            $scope.currentNode.loading = true;
            legacyResource.deleteItem({
                nodeId: $scope.currentNode.id,
                nodeType: $scope.currentNode.nodeType,
                alias: $scope.currentNode.name
            }).then(function () {
                $scope.currentNode.loading = false;
                //TODO: Need to sync tree, etc...
                treeService.removeNode($scope.currentNode);
                navigationService.hideMenu();
            });
        };
        $scope.cancel = function () {
            navigationService.hideDialog();
        };
    }
    angular.module('umbraco').controller('Umbraco.Dialogs.LegacyDeleteController', LegacyDeleteController);
    //used for the media picker dialog
    angular.module('umbraco').controller('Umbraco.Dialogs.LinkPickerController', function ($scope, eventsService, dialogService, entityResource, mediaHelper, userService, localizationService, tinyMceService) {
        var dialogOptions = $scope.dialogOptions;
        var searchText = 'Search...';
        localizationService.localize('general_search').then(function (value) {
            searchText = value + '...';
        });
        $scope.dialogTreeEventHandler = $({});
        $scope.target = {};
        $scope.searchInfo = {
            searchFromId: null,
            searchFromName: null,
            showSearch: false,
            dataTypeId: $scope.model && $scope.model.dataTypeId ? $scope.model.dataTypeId : null,
            results: [],
            selectedSearchResults: []
        };
        if (dialogOptions.currentTarget) {
            $scope.target = dialogOptions.currentTarget;
            //if we have a node ID, we fetch the current node to build the form data
            if ($scope.target.id || $scope.target.udi) {
                var id = $scope.target.udi ? $scope.target.udi : $scope.target.id;
                if (!$scope.target.path) {
                    entityResource.getPath(id, 'Document').then(function (path) {
                        $scope.target.path = path;
                        //now sync the tree to this path
                        $scope.dialogTreeEventHandler.syncTree({
                            path: $scope.target.path,
                            tree: 'content'
                        });
                    });
                }
                // if a link exists, get the properties to build the anchor name list
                entityResource.getUrlAndAnchors(id).then(function (resp) {
                    $scope.anchorValues = resp.anchorValues;
                    $scope.target.url = resp.url;
                });
            } else if ($scope.target.url.length) {
                // a url but no id/udi indicates an external link - trim the url to remove the anchor/qs
                // only do the substring if there's a # or a ?
                var indexOfAnchor = $scope.target.url.search(/(#|\?)/);
                if (indexOfAnchor > -1) {
                    // populate the anchor
                    $scope.target.anchor = $scope.target.url.substring(indexOfAnchor);
                    // then rewrite the model and populate the link
                    $scope.target.url = $scope.target.url.substring(0, indexOfAnchor);
                }
            }
        }
        if (dialogOptions.anchors) {
            $scope.anchorValues = dialogOptions.anchors;
        }
        function nodeSelectHandler(ev, args) {
            args.event.preventDefault();
            args.event.stopPropagation();
            if (args.node.metaData.listViewNode) {
                //check if list view 'search' node was selected
                $scope.searchInfo.showSearch = true;
                $scope.searchInfo.searchFromId = args.node.metaData.listViewNode.id;
                $scope.searchInfo.searchFromName = args.node.metaData.listViewNode.name;
            } else {
                eventsService.emit('dialogs.linkPicker.select', args);
                if ($scope.currentNode) {
                    //un-select if there's a current one selected
                    $scope.currentNode.selected = false;
                }
                $scope.currentNode = args.node;
                $scope.currentNode.selected = true;
                $scope.target.id = args.node.id;
                $scope.target.udi = args.node.udi;
                $scope.target.name = args.node.name;
                if (args.node.id < 0) {
                    $scope.target.url = '/';
                } else {
                    entityResource.getUrlAndAnchors(args.node.id).then(function (resp) {
                        $scope.anchorValues = resp.anchorValues;
                        $scope.target.url = resp.url;
                    });
                }
                if (!angular.isUndefined($scope.target.isMedia)) {
                    delete $scope.target.isMedia;
                }
            }
        }
        function nodeExpandedHandler(ev, args) {
            if (angular.isArray(args.children)) {
                //iterate children
                _.each(args.children, function (child) {
                    //check if any of the items are list views, if so we need to add a custom
                    // child: A node to activate the search
                    if (child.metaData.isContainer) {
                        child.hasChildren = true;
                        child.children = [{
                                level: child.level + 1,
                                hasChildren: false,
                                name: searchText,
                                metaData: { listViewNode: child },
                                cssClass: 'icon umb-tree-icon sprTree icon-search',
                                cssClasses: ['not-published']
                            }];
                    }
                });
            }
        }
        $scope.switchToMediaPicker = function () {
            userService.getCurrentUser().then(function (userData) {
                dialogService.mediaPicker({
                    startNodeId: userData.startMediaIds.length == 0 ? -1 : userData.startMediaIds[0],
                    callback: function (media) {
                        $scope.target.id = media.id;
                        $scope.target.isMedia = true;
                        $scope.target.name = media.name;
                        $scope.target.url = media.image;
                    }
                });
            });
        };
        $scope.hideSearch = function () {
            $scope.searchInfo.showSearch = false;
            $scope.searchInfo.searchFromId = null;
            $scope.searchInfo.searchFromName = null;
            $scope.searchInfo.results = [];
        };
        // method to select a search result
        $scope.selectResult = function (evt, result) {
            result.selected = result.selected === true ? false : true;
            nodeSelectHandler(evt, {
                event: evt,
                node: result
            });
        };
        //callback when there are search results
        $scope.onSearchResults = function (results) {
            $scope.searchInfo.results = results;
            $scope.searchInfo.showSearch = true;
        };
        $scope.dialogTreeEventHandler.bind('treeNodeSelect', nodeSelectHandler);
        $scope.dialogTreeEventHandler.bind('treeNodeExpanded', nodeExpandedHandler);
        $scope.$on('$destroy', function () {
            $scope.dialogTreeEventHandler.unbind('treeNodeSelect', nodeSelectHandler);
            $scope.dialogTreeEventHandler.unbind('treeNodeExpanded', nodeExpandedHandler);
        });
    });
    angular.module('umbraco').controller('Umbraco.Dialogs.LoginController', function ($scope, $cookies, $location, currentUserResource, formHelper, mediaHelper, umbRequestHelper, Upload, localizationService, userService, externalLoginInfo, resetPasswordCodeInfo, $timeout, authResource, dialogService, $q) {
        $scope.invitedUser = null;
        $scope.invitedUserPasswordModel = {
            password: '',
            confirmPassword: '',
            buttonState: '',
            passwordPolicies: null,
            passwordPolicyText: ''
        };
        $scope.loginStates = { submitButton: 'init' };
        $scope.avatarFile = {
            filesHolder: null,
            uploadStatus: null,
            uploadProgress: 0,
            maxFileSize: Umbraco.Sys.ServerVariables.umbracoSettings.maxFileSize + 'KB',
            acceptedFileTypes: mediaHelper.formatFileTypes(Umbraco.Sys.ServerVariables.umbracoSettings.imageFileTypes),
            uploaded: false
        };
        $scope.togglePassword = function () {
            var elem = $('form[name=\'loginForm\'] input[name=\'password\']');
            elem.attr('type', elem.attr('type') === 'text' ? 'password' : 'text');
            $('.password-text.show, .password-text.hide').toggle();
        };
        function init() {
            // Check if it is a new user
            var inviteVal = $location.search().invite;
            //1 = enter password, 2 = password set, 3 = invalid token
            if (inviteVal && (inviteVal === '1' || inviteVal === '2')) {
                $q.all([
                    //get the current invite user
                    authResource.getCurrentInvitedUser().then(function (data) {
                        $scope.invitedUser = data;
                    }, function () {
                        //it failed so we should remove the search
                        $location.search('invite', null);
                    }),
                    //get the membership provider config for password policies
                    authResource.getMembershipProviderConfig().then(function (data) {
                        $scope.invitedUserPasswordModel.passwordPolicies = data;
                        //localize the text
                        localizationService.localize('errorHandling_errorInPasswordFormat', [
                            $scope.invitedUserPasswordModel.passwordPolicies.minPasswordLength,
                            $scope.invitedUserPasswordModel.passwordPolicies.minNonAlphaNumericChars
                        ]).then(function (data) {
                            $scope.invitedUserPasswordModel.passwordPolicyText = data;
                        });
                    })
                ]).then(function () {
                    $scope.inviteStep = Number(inviteVal);
                });
            } else if (inviteVal && inviteVal === '3') {
                $scope.inviteStep = Number(inviteVal);
            }
        }
        $scope.changeAvatar = function (files, event) {
            if (files && files.length > 0) {
                upload(files[0]);
            }
        };
        $scope.getStarted = function () {
            $location.search('invite', null);
            $scope.submit(true);
        };
        function upload(file) {
            $scope.avatarFile.uploadProgress = 0;
            Upload.upload({
                url: umbRequestHelper.getApiUrl('currentUserApiBaseUrl', 'PostSetAvatar'),
                fields: {},
                file: file
            }).progress(function (evt) {
                if ($scope.avatarFile.uploadStatus !== 'done' && $scope.avatarFile.uploadStatus !== 'error') {
                    // set uploading status on file
                    $scope.avatarFile.uploadStatus = 'uploading';
                    // calculate progress in percentage
                    var progressPercentage = parseInt(100 * evt.loaded / evt.total, 10);
                    // set percentage property on file
                    $scope.avatarFile.uploadProgress = progressPercentage;
                }
            }).success(function (data, status, headers, config) {
                $scope.avatarFile.uploadProgress = 100;
                // set done status on file
                $scope.avatarFile.uploadStatus = 'done';
                $scope.invitedUser.avatars = data;
                $scope.avatarFile.uploaded = true;
            }).error(function (evt, status, headers, config) {
                // set status done
                $scope.avatarFile.uploadStatus = 'error';
                // If file not found, server will return a 404 and display this message
                if (status === 404) {
                    $scope.avatarFile.serverErrorMessage = 'File not found';
                } else if (status == 400) {
                    //it's a validation error
                    $scope.avatarFile.serverErrorMessage = evt.message;
                } else {
                    //it's an unhandled error
                    //if the service returns a detailed error
                    if (evt.InnerException) {
                        $scope.avatarFile.serverErrorMessage = evt.InnerException.ExceptionMessage;
                        //Check if its the common "too large file" exception
                        if (evt.InnerException.StackTrace && evt.InnerException.StackTrace.indexOf('ValidateRequestEntityLength') > 0) {
                            $scope.avatarFile.serverErrorMessage = 'File too large to upload';
                        }
                    } else if (evt.Message) {
                        $scope.avatarFile.serverErrorMessage = evt.Message;
                    }
                }
            });
        }
        $scope.inviteSavePassword = function () {
            if (formHelper.submitForm({
                    scope: $scope,
                    statusMessage: 'Saving...'
                })) {
                $scope.invitedUserPasswordModel.buttonState = 'busy';
                currentUserResource.performSetInvitedUserPassword($scope.invitedUserPasswordModel.password).then(function (data) {
                    //success
                    formHelper.resetForm({
                        scope: $scope,
                        notifications: data.notifications
                    });
                    $scope.invitedUserPasswordModel.buttonState = 'success';
                    //set the user and set them as logged in
                    $scope.invitedUser = data;
                    userService.setAuthenticationSuccessful(data);
                    $scope.inviteStep = 2;
                }, function (err) {
                    //error
                    formHelper.handleError(err);
                    $scope.invitedUserPasswordModel.buttonState = 'error';
                });
            }
        };
        var setFieldFocus = function (form, field) {
            $timeout(function () {
                $('form[name=\'' + form + '\'] input[name=\'' + field + '\']').focus();
            });
        };
        var twoFactorloginDialog = null;
        function show2FALoginDialog(view, callback) {
            if (!twoFactorloginDialog) {
                twoFactorloginDialog = dialogService.open({
                    //very special flag which means that global events cannot close this dialog
                    manualClose: true,
                    template: view,
                    modalClass: 'login-overlay',
                    animation: 'slide',
                    show: true,
                    callback: callback
                });
            }
        }
        function resetInputValidation() {
            $scope.confirmPassword = '';
            $scope.password = '';
            $scope.login = '';
            if ($scope.loginForm) {
                $scope.loginForm.username.$setValidity('auth', true);
                $scope.loginForm.password.$setValidity('auth', true);
            }
            if ($scope.requestPasswordResetForm) {
                $scope.requestPasswordResetForm.email.$setValidity('auth', true);
            }
            if ($scope.setPasswordForm) {
                $scope.setPasswordForm.password.$setValidity('auth', true);
                $scope.setPasswordForm.confirmPassword.$setValidity('auth', true);
            }
        }
        $scope.allowPasswordReset = Umbraco.Sys.ServerVariables.umbracoSettings.canSendRequiredEmail && Umbraco.Sys.ServerVariables.umbracoSettings.allowPasswordReset;
        $scope.showLogin = function () {
            $scope.errorMsg = '';
            resetInputValidation();
            $scope.view = 'login';
            setFieldFocus('loginForm', 'username');
        };
        $scope.showRequestPasswordReset = function () {
            $scope.errorMsg = '';
            resetInputValidation();
            $scope.view = 'request-password-reset';
            $scope.showEmailResetConfirmation = false;
            setFieldFocus('requestPasswordResetForm', 'email');
        };
        $scope.showSetPassword = function () {
            $scope.errorMsg = '';
            resetInputValidation();
            $scope.view = 'set-password';
            setFieldFocus('setPasswordForm', 'password');
        };
        var d = new Date();
        var konamiGreetings = new Array('Suze Sunday', 'Malibu Monday', 'Tequila Tuesday', 'Whiskey Wednesday', 'Negroni Day', 'Fernet Friday', 'Sancerre Saturday');
        var konamiMode = $cookies.konamiLogin;
        if (konamiMode == '1') {
            $scope.greeting = 'Happy ' + konamiGreetings[d.getDay()];
        } else {
            localizationService.localize('login_greeting' + d.getDay()).then(function (label) {
                $scope.greeting = label;
            });    // weekday[d.getDay()];
        }
        $scope.errorMsg = '';
        $scope.externalLoginFormAction = Umbraco.Sys.ServerVariables.umbracoUrls.externalLoginsUrl;
        $scope.externalLoginProviders = externalLoginInfo.providers;
        $scope.externalLoginInfo = externalLoginInfo;
        $scope.resetPasswordCodeInfo = resetPasswordCodeInfo;
        $scope.backgroundImage = Umbraco.Sys.ServerVariables.umbracoSettings.loginBackgroundImage;
        $scope.activateKonamiMode = function () {
            if ($cookies.konamiLogin == '1') {
                // somehow I can't update the cookie value using $cookies, so going native
                document.cookie = 'konamiLogin=; expires=Thu, 01 Jan 1970 00:00:01 GMT;';
                document.location.reload();
            } else {
                document.cookie = 'konamiLogin=1; expires=Tue, 01 Jan 2030 00:00:01 GMT;';
                $scope.$apply(function () {
                    $scope.greeting = 'Happy ' + konamiGreetings[d.getDay()];
                });
            }
        };
        $scope.loginSubmit = function (login, password) {
            //TODO: Do validation properly like in the invite password update
            //if the login and password are not empty we need to automatically
            // validate them - this is because if there are validation errors on the server
            // then the user has to change both username & password to resubmit which isn't ideal,
            // so if they're not empty, we'll just make sure to set them to valid.
            if (login && password && login.length > 0 && password.length > 0) {
                $scope.loginForm.username.$setValidity('auth', true);
                $scope.loginForm.password.$setValidity('auth', true);
            }
            if ($scope.loginForm.$invalid) {
                return;
            }
            $scope.loginStates.submitButton = 'busy';
            userService.authenticate(login, password).then(function (data) {
                $scope.loginStates.submitButton = 'success';
                $scope.submit(true);
            }, function (reason) {
                //is Two Factor required?
                if (reason.status === 402) {
                    $scope.errorMsg = 'Additional authentication required';
                    show2FALoginDialog(reason.data.twoFactorView, $scope.submit);
                } else {
                    $scope.loginStates.submitButton = 'error';
                    $scope.errorMsg = reason.errorMsg;
                    //set the form inputs to invalid
                    $scope.loginForm.username.$setValidity('auth', false);
                    $scope.loginForm.password.$setValidity('auth', false);
                }
            });
            //setup a watch for both of the model values changing, if they change
            // while the form is invalid, then revalidate them so that the form can
            // be submitted again.
            $scope.loginForm.username.$viewChangeListeners.push(function () {
                if ($scope.loginForm.$invalid) {
                    $scope.loginForm.username.$setValidity('auth', true);
                    $scope.loginForm.password.$setValidity('auth', true);
                }
            });
            $scope.loginForm.password.$viewChangeListeners.push(function () {
                if ($scope.loginForm.$invalid) {
                    $scope.loginForm.username.$setValidity('auth', true);
                    $scope.loginForm.password.$setValidity('auth', true);
                }
            });
        };
        $scope.requestPasswordResetSubmit = function (email) {
            //TODO: Do validation properly like in the invite password update
            if (email && email.length > 0) {
                $scope.requestPasswordResetForm.email.$setValidity('auth', true);
            }
            $scope.showEmailResetConfirmation = false;
            if ($scope.requestPasswordResetForm.$invalid) {
                return;
            }
            $scope.errorMsg = '';
            authResource.performRequestPasswordReset(email).then(function () {
                //remove the email entered
                $scope.email = '';
                $scope.showEmailResetConfirmation = true;
            }, function (reason) {
                $scope.errorMsg = reason.errorMsg;
                $scope.requestPasswordResetForm.email.$setValidity('auth', false);
            });
            $scope.requestPasswordResetForm.email.$viewChangeListeners.push(function () {
                if ($scope.requestPasswordResetForm.email.$invalid) {
                    $scope.requestPasswordResetForm.email.$setValidity('auth', true);
                }
            });
        };
        $scope.setPasswordSubmit = function (password, confirmPassword) {
            $scope.showSetPasswordConfirmation = false;
            if (password && confirmPassword && password.length > 0 && confirmPassword.length > 0) {
                $scope.setPasswordForm.password.$setValidity('auth', true);
                $scope.setPasswordForm.confirmPassword.$setValidity('auth', true);
            }
            if ($scope.setPasswordForm.$invalid) {
                return;
            }
            //TODO: All of this logic can/should be shared! We should do validation the nice way instead of all of this manual stuff, see: inviteSavePassword
            authResource.performSetPassword($scope.resetPasswordCodeInfo.resetCodeModel.userId, password, confirmPassword, $scope.resetPasswordCodeInfo.resetCodeModel.resetCode).then(function () {
                $scope.showSetPasswordConfirmation = true;
                $scope.resetComplete = true;
                //reset the values in the resetPasswordCodeInfo angular so if someone logs out the change password isn't shown again
                resetPasswordCodeInfo.resetCodeModel = null;
            }, function (reason) {
                if (reason.data && reason.data.Message) {
                    $scope.errorMsg = reason.data.Message;
                } else {
                    $scope.errorMsg = reason.errorMsg;
                }
                $scope.setPasswordForm.password.$setValidity('auth', false);
                $scope.setPasswordForm.confirmPassword.$setValidity('auth', false);
            });
            $scope.setPasswordForm.password.$viewChangeListeners.push(function () {
                if ($scope.setPasswordForm.password.$invalid) {
                    $scope.setPasswordForm.password.$setValidity('auth', true);
                }
            });
            $scope.setPasswordForm.confirmPassword.$viewChangeListeners.push(function () {
                if ($scope.setPasswordForm.confirmPassword.$invalid) {
                    $scope.setPasswordForm.confirmPassword.$setValidity('auth', true);
                }
            });
        };
        //Now, show the correct panel:
        if ($scope.resetPasswordCodeInfo.resetCodeModel) {
            $scope.showSetPassword();
        } else if ($scope.resetPasswordCodeInfo.errors.length > 0) {
            $scope.view = 'password-reset-code-expired';
        } else {
            $scope.showLogin();
        }
        init();
    });
    //used for the macro picker dialog
    angular.module('umbraco').controller('Umbraco.Dialogs.MacroPickerController', function ($scope, macroFactory, umbPropEditorHelper) {
        $scope.macros = macroFactory.all(true);
        $scope.dialogMode = 'list';
        $scope.configureMacro = function (macro) {
            $scope.dialogMode = 'configure';
            $scope.dialogData.macro = macroFactory.getMacro(macro.alias);
            //set the correct view for each item
            for (var i = 0; i < dialogData.macro.properties.length; i++) {
                dialogData.macro.properties[i].editorView = umbPropEditorHelper.getViewPath(dialogData.macro.properties[i].view);
            }
        };
    });
    //used for the media picker dialog
    angular.module('umbraco').controller('Umbraco.Dialogs.MediaPickerController', function ($scope, mediaResource, umbRequestHelper, entityResource, $log, mediaHelper, mediaTypeHelper, eventsService, treeService) {
        var dialogOptions = $scope.dialogOptions;
        $scope.onlyImages = dialogOptions.onlyImages;
        $scope.showDetails = dialogOptions.showDetails;
        $scope.multiPicker = dialogOptions.multiPicker && dialogOptions.multiPicker !== '0' ? true : false;
        $scope.startNodeId = dialogOptions.startNodeId ? dialogOptions.startNodeId : -1;
        $scope.cropSize = dialogOptions.cropSize;
        //preload selected item
        $scope.target = undefined;
        if (dialogOptions.currentTarget) {
            $scope.target = dialogOptions.currentTarget;
        }
        $scope.acceptedMediatypes = [];
        mediaTypeHelper.getAllowedImagetypes($scope.startNodeId).then(function (types) {
            $scope.acceptedMediatypes = types;
        });
        $scope.upload = function (v) {
            angular.element('.umb-file-dropzone-directive .file-select').click();
        };
        $scope.dragLeave = function (el, event) {
            $scope.activeDrag = false;
        };
        $scope.dragEnter = function (el, event) {
            $scope.activeDrag = true;
        };
        $scope.submitFolder = function (e) {
            if (e.keyCode === 13) {
                e.preventDefault();
                mediaResource.addFolder($scope.newFolderName, $scope.currentFolder.id).then(function (data) {
                    $scope.showFolderInput = false;
                    $scope.newFolderName = '';
                    //we've added a new folder so lets clear the tree cache for that specific item
                    treeService.clearCache({
                        cacheKey: '__media',
                        //this is the main media tree cache key
                        childrenOf: data.parentId
                    });
                    $scope.gotoFolder(data);
                });
            }
        };
        $scope.gotoFolder = function (folder) {
            if (!folder) {
                folder = {
                    id: -1,
                    name: 'Media',
                    icon: 'icon-folder'
                };
            }
            if (folder.id > 0) {
                entityResource.getAncestors(folder.id, 'media').then(function (anc) {
                    // anc.splice(0,1);
                    $scope.path = _.filter(anc, function (f) {
                        return f.path.indexOf($scope.startNodeId) !== -1;
                    });
                });
                mediaTypeHelper.getAllowedImagetypes(folder.id).then(function (types) {
                    $scope.acceptedMediatypes = types;
                });
            } else {
                $scope.path = [];
            }
            //mediaResource.rootMedia()
            entityResource.getChildren(folder.id, 'Media').then(function (data) {
                for (i = 0; i < data.length; i++) {
                    if (data[i].metaData.MediaPath) {
                        data[i].thumbnail = mediaHelper.resolveFileFromEntity(data[i], true);
                        data[i].image = mediaHelper.resolveFileFromEntity(data[i], false);
                    }
                }
                $scope.searchTerm = '';
                $scope.images = data ? data : [];
            });
            $scope.currentFolder = folder;
        };
        $scope.clickHandler = function (image, ev, select) {
            ev.preventDefault();
            if (image.isFolder && !select) {
                $scope.gotoFolder(image);
            } else {
                eventsService.emit('dialogs.mediaPicker.select', image);
                //we have 3 options add to collection (if multi) show details, or submit it right back to the callback
                if ($scope.multiPicker) {
                    $scope.select(image);
                    image.cssclass = $scope.dialogData.selection.indexOf(image) > -1 ? 'selected' : '';
                } else if ($scope.showDetails) {
                    $scope.target = image;
                    $scope.target.url = mediaHelper.resolveFile(image);
                } else {
                    $scope.submit(image);
                }
            }
        };
        $scope.exitDetails = function () {
            if (!$scope.currentFolder) {
                $scope.gotoFolder();
            }
            $scope.target = undefined;
        };
        $scope.onUploadComplete = function () {
            $scope.gotoFolder($scope.currentFolder);
        };
        $scope.onFilesQueue = function () {
            $scope.activeDrag = false;
        };
        //default root item
        if (!$scope.target) {
            $scope.gotoFolder({
                id: $scope.startNodeId,
                name: 'Media',
                icon: 'icon-folder'
            });
        }
    });
    //used for the member picker dialog
    angular.module('umbraco').controller('Umbraco.Dialogs.MemberGroupPickerController', function ($scope, eventsService, entityResource, searchService, $log) {
        var dialogOptions = $scope.dialogOptions;
        $scope.dialogTreeEventHandler = $({});
        $scope.multiPicker = dialogOptions.multiPicker;
        /** Method used for selecting a node */
        function select(text, id) {
            if (dialogOptions.multiPicker) {
                $scope.select(id);
            } else {
                $scope.submit(id);
            }
        }
        function nodeSelectHandler(ev, args) {
            args.event.preventDefault();
            args.event.stopPropagation();
            eventsService.emit('dialogs.memberGroupPicker.select', args);
            //This is a tree node, so we don't have an entity to pass in, it will need to be looked up
            //from the server in this method.
            select(args.node.name, args.node.id);
            //toggle checked state
            args.node.selected = args.node.selected === true ? false : true;
        }
        $scope.dialogTreeEventHandler.bind('treeNodeSelect', nodeSelectHandler);
        $scope.$on('$destroy', function () {
            $scope.dialogTreeEventHandler.unbind('treeNodeSelect', nodeSelectHandler);
        });
    });
    angular.module('umbraco').controller('Umbraco.Dialogs.RteEmbedController', function ($scope, $http, umbRequestHelper) {
        $scope.form = {};
        $scope.form.url = '';
        $scope.form.width = 360;
        $scope.form.height = 240;
        $scope.form.constrain = true;
        $scope.form.preview = '';
        $scope.form.success = false;
        $scope.form.info = '';
        $scope.form.supportsDimensions = false;
        var origWidth = 500;
        var origHeight = 300;
        $scope.showPreview = function () {
            if ($scope.form.url) {
                $scope.form.show = true;
                $scope.form.preview = '<div class="umb-loader" style="height: 10px; margin: 10px 0px;"></div>';
                $scope.form.info = '';
                $scope.form.success = false;
                $http({
                    method: 'GET',
                    url: umbRequestHelper.getApiUrl('embedApiBaseUrl', 'GetEmbed'),
                    params: {
                        url: $scope.form.url,
                        width: $scope.form.width,
                        height: $scope.form.height
                    }
                }).success(function (data) {
                    $scope.form.preview = '';
                    switch (data.Status) {
                    case 0:
                        //not supported
                        $scope.form.info = 'Not supported';
                        break;
                    case 1:
                        //error
                        $scope.form.info = 'Could not embed media - please ensure the URL is valid';
                        break;
                    case 2:
                        $scope.form.preview = data.Markup;
                        $scope.form.supportsDimensions = data.SupportsDimensions;
                        $scope.form.success = true;
                        break;
                    }
                }).error(function () {
                    $scope.form.supportsDimensions = false;
                    $scope.form.preview = '';
                    $scope.form.info = 'Could not embed media - please ensure the URL is valid';
                });
            } else {
                $scope.form.supportsDimensions = false;
                $scope.form.preview = '';
                $scope.form.info = 'Please enter a URL';
            }
        };
        $scope.changeSize = function (type) {
            var width, height;
            if ($scope.form.constrain) {
                width = parseInt($scope.form.width, 10);
                height = parseInt($scope.form.height, 10);
                if (type == 'width') {
                    origHeight = Math.round(width / origWidth * height);
                    $scope.form.height = origHeight;
                } else {
                    origWidth = Math.round(height / origHeight * width);
                    $scope.form.width = origWidth;
                }
            }
            if ($scope.form.url != '') {
                $scope.showPreview();
            }
        };
        $scope.insert = function () {
            $scope.submit($scope.form.preview);
        };
    });
    angular.module('umbraco').controller('Umbraco.Dialogs.Template.QueryBuilderController', function ($scope, $http, dialogService) {
        $http.get('backoffice/UmbracoApi/TemplateQuery/GetAllowedProperties').then(function (response) {
            $scope.properties = response.data;
        });
        $http.get('backoffice/UmbracoApi/TemplateQuery/GetContentTypes').then(function (response) {
            $scope.contentTypes = response.data;
        });
        $http.get('backoffice/UmbracoApi/TemplateQuery/GetFilterConditions').then(function (response) {
            $scope.conditions = response.data;
        });
        $scope.query = {
            contentType: { name: 'Everything' },
            source: { name: 'My website' },
            filters: [{
                    property: undefined,
                    operator: undefined
                }],
            sort: {
                property: {
                    alias: '',
                    name: ''
                },
                direction: 'ascending'
            }
        };
        $scope.chooseSource = function (query) {
            dialogService.contentPicker({
                callback: function (data) {
                    if (data.id > 0) {
                        query.source = {
                            id: data.id,
                            name: data.name
                        };
                    } else {
                        query.source.name = 'My website';
                        delete query.source.id;
                    }
                }
            });
        };
        var throttledFunc = _.throttle(function () {
            $http.post('backoffice/UmbracoApi/TemplateQuery/PostTemplateQuery', $scope.query).then(function (response) {
                $scope.result = response.data;
            });
        }, 200);
        $scope.$watch('query', function (value) {
            throttledFunc();
        }, true);
        $scope.getPropertyOperators = function (property) {
            var conditions = _.filter($scope.conditions, function (condition) {
                var index = condition.appliesTo.indexOf(property.type);
                return index >= 0;
            });
            return conditions;
        };
        $scope.addFilter = function (query) {
            query.filters.push({});
        };
        $scope.trashFilter = function (query) {
            query.filters.splice(query, 1);
        };
        $scope.changeSortOrder = function (query) {
            if (query.sort.direction === 'ascending') {
                query.sort.direction = 'descending';
            } else {
                query.sort.direction = 'ascending';
            }
        };
        $scope.setSortProperty = function (query, property) {
            query.sort.property = property;
            if (property.type === 'datetime') {
                query.sort.direction = 'descending';
            } else {
                query.sort.direction = 'ascending';
            }
        };
    });
    angular.module('umbraco').controller('Umbraco.Dialogs.Template.SnippetController', function ($scope) {
        $scope.type = $scope.dialogOptions.type;
        $scope.section = {
            name: '',
            required: false
        };
    });
    //used for the media picker dialog
    angular.module('umbraco').controller('Umbraco.Dialogs.TreePickerController', function ($scope, entityResource, eventsService, $log, searchService, angularHelper, $timeout, localizationService, treeService) {
        var tree = null;
        var dialogOptions = $scope.dialogOptions;
        $scope.dialogTreeEventHandler = $({});
        $scope.section = dialogOptions.section;
        $scope.treeAlias = dialogOptions.treeAlias;
        $scope.multiPicker = dialogOptions.multiPicker;
        $scope.hideHeader = typeof dialogOptions.hideHeader === 'boolean' ? dialogOptions.hideHeader : true;
        ;
        $scope.searchInfo = {
            searchFromId: dialogOptions.startNodeId,
            searchFromName: null,
            showSearch: false,
            results: [],
            selectedSearchResults: []
        };
        //create the custom query string param for this tree
        $scope.customTreeParams = dialogOptions.startNodeId ? 'startNodeId=' + dialogOptions.startNodeId : '';
        $scope.customTreeParams += dialogOptions.customTreeParams ? '&' + dialogOptions.customTreeParams : '';
        var searchText = 'Search...';
        localizationService.localize('general_search').then(function (value) {
            searchText = value + '...';
        });
        // Allow the entity type to be passed in but defaults to Document for backwards compatibility.
        var entityType = dialogOptions.entityType ? dialogOptions.entityType : 'Document';
        //min / max values
        if (dialogOptions.minNumber) {
            dialogOptions.minNumber = parseInt(dialogOptions.minNumber, 10);
        }
        if (dialogOptions.maxNumber) {
            dialogOptions.maxNumber = parseInt(dialogOptions.maxNumber, 10);
        }
        if (dialogOptions.section === 'member') {
            entityType = 'Member';
        } else if (dialogOptions.section === 'media') {
            entityType = 'Media';
        }
        //Configures filtering
        if (dialogOptions.filter) {
            dialogOptions.filterExclude = false;
            dialogOptions.filterAdvanced = false;
            //used advanced filtering
            if (angular.isFunction(dialogOptions.filter)) {
                dialogOptions.filterAdvanced = true;
            } else if (angular.isObject(dialogOptions.filter)) {
                dialogOptions.filterAdvanced = true;
            } else {
                if (dialogOptions.filter.startsWith('!')) {
                    dialogOptions.filterExclude = true;
                    dialogOptions.filter = dialogOptions.filter.substring(1);
                }
                //used advanced filtering
                if (dialogOptions.filter.startsWith('{')) {
                    dialogOptions.filterAdvanced = true;
                    //convert to object
                    dialogOptions.filter = angular.fromJson(dialogOptions.filter);
                }
            }
        }
        function nodeExpandedHandler(ev, args) {
            if (angular.isArray(args.children)) {
                //iterate children
                _.each(args.children, function (child) {
                    //check if any of the items are list views, if so we need to add some custom
                    // children: A node to activate the search, any nodes that have already been
                    // selected in the search
                    if (child.metaData.isContainer) {
                        child.hasChildren = true;
                        child.children = [{
                                level: child.level + 1,
                                hasChildren: false,
                                parent: function () {
                                    return child;
                                },
                                name: searchText,
                                metaData: { listViewNode: child },
                                cssClass: 'icon-search',
                                cssClasses: ['not-published']
                            }];
                        //add base transition classes to this node
                        child.cssClasses.push('tree-node-slide-up');
                        var listViewResults = _.filter($scope.searchInfo.selectedSearchResults, function (i) {
                            return i.parentId == child.id;
                        });
                        _.each(listViewResults, function (item) {
                            child.children.unshift({
                                id: item.id,
                                name: item.name,
                                cssClass: 'icon umb-tree-icon sprTree ' + item.icon,
                                level: child.level + 1,
                                metaData: { isSearchResult: true },
                                hasChildren: false,
                                parent: function () {
                                    return child;
                                }
                            });
                        });
                    }
                    //now we need to look in the already selected search results and
                    // toggle the check boxes for those ones that are listed
                    var exists = _.find($scope.searchInfo.selectedSearchResults, function (selected) {
                        return child.id == selected.id;
                    });
                    if (exists) {
                        child.selected = true;
                    }
                });
                //check filter
                performFiltering(args.children);
            }
        }
        //gets the tree object when it loads
        function treeLoadedHandler(ev, args) {
            tree = args.tree;
        }
        //wires up selection
        function nodeSelectHandler(ev, args) {
            args.event.preventDefault();
            args.event.stopPropagation();
            if (args.node.metaData.listViewNode) {
                //check if list view 'search' node was selected
                $scope.searchInfo.showSearch = true;
                $scope.searchInfo.searchFromId = args.node.metaData.listViewNode.id;
                $scope.searchInfo.searchFromName = args.node.metaData.listViewNode.name;
                //add transition classes
                var listViewNode = args.node.parent();
                listViewNode.cssClasses.push('tree-node-slide-up-hide-active');
            } else if (args.node.metaData.isSearchResult) {
                //check if the item selected was a search result from a list view
                //unselect
                select(args.node.name, args.node.id);
                //remove it from the list view children
                var listView = args.node.parent();
                listView.children = _.reject(listView.children, function (child) {
                    return child.id == args.node.id;
                });
                //remove it from the custom tracked search result list
                $scope.searchInfo.selectedSearchResults = _.reject($scope.searchInfo.selectedSearchResults, function (i) {
                    return i.id == args.node.id;
                });
            } else {
                eventsService.emit('dialogs.treePickerController.select', args);
                if (args.node.filtered) {
                    return;
                }
                //This is a tree node, so we don't have an entity to pass in, it will need to be looked up
                //from the server in this method.
                select(args.node.name, args.node.id);
                //toggle checked state
                args.node.selected = args.node.selected === true ? false : true;
            }
        }
        /** Method used for selecting a node */
        function select(text, id, entity) {
            //if we get the root, we just return a constructed entity, no need for server data
            if (id < 0) {
                if ($scope.multiPicker) {
                    $scope.select(id);
                } else {
                    var node = {
                        alias: null,
                        icon: 'icon-folder',
                        id: id,
                        name: text
                    };
                    $scope.submit(node);
                }
            } else {
                if ($scope.multiPicker) {
                    $scope.select(Number(id));
                } else {
                    $scope.hideSearch();
                    //if an entity has been passed in, use it
                    if (entity) {
                        $scope.submit(entity);
                    } else {
                        //otherwise we have to get it from the server
                        entityResource.getById(id, entityType).then(function (ent) {
                            $scope.submit(ent);
                        });
                    }
                }
            }
        }
        function performFiltering(nodes) {
            if (!dialogOptions.filter) {
                return;
            }
            //remove any list view search nodes from being filtered since these are special nodes that always must
            // be allowed to be clicked on
            nodes = _.filter(nodes, function (n) {
                return !angular.isObject(n.metaData.listViewNode);
            });
            if (dialogOptions.filterAdvanced) {
                //filter either based on a method or an object
                var filtered = angular.isFunction(dialogOptions.filter) ? _.filter(nodes, dialogOptions.filter) : _.where(nodes, dialogOptions.filter);
                angular.forEach(filtered, function (value, key) {
                    value.filtered = true;
                    if (dialogOptions.filterCssClass) {
                        if (!value.cssClasses) {
                            value.cssClasses = [];
                        }
                        value.cssClasses.push(dialogOptions.filterCssClass);
                    }
                });
            } else {
                var a = dialogOptions.filter.toLowerCase().replace(/\s/g, '').split(',');
                angular.forEach(nodes, function (value, key) {
                    var found = a.indexOf(value.metaData.contentType.toLowerCase()) >= 0;
                    if (!dialogOptions.filterExclude && !found || dialogOptions.filterExclude && found) {
                        value.filtered = true;
                        if (dialogOptions.filterCssClass) {
                            if (!value.cssClasses) {
                                value.cssClasses = [];
                            }
                            value.cssClasses.push(dialogOptions.filterCssClass);
                        }
                    }
                });
            }
        }
        $scope.multiSubmit = function (result) {
            entityResource.getByIds(result, entityType).then(function (ents) {
                $scope.submit(ents);
            });
        };
        /** method to select a search result */
        $scope.selectResult = function (evt, result) {
            if (result.filtered) {
                return;
            }
            result.selected = result.selected === true ? false : true;
            //since result = an entity, we'll pass it in so we don't have to go back to the server
            select(result.name, result.id, result);
            //add/remove to our custom tracked list of selected search results
            if (result.selected) {
                $scope.searchInfo.selectedSearchResults.push(result);
            } else {
                $scope.searchInfo.selectedSearchResults = _.reject($scope.searchInfo.selectedSearchResults, function (i) {
                    return i.id == result.id;
                });
            }
            //ensure the tree node in the tree is checked/unchecked if it already exists there
            if (tree) {
                var found = treeService.getDescendantNode(tree.root, result.id);
                if (found) {
                    found.selected = result.selected;
                }
            }
        };
        $scope.hideSearch = function () {
            //Traverse the entire displayed tree and update each node to sync with the selected search results
            if (tree) {
                //we need to ensure that any currently displayed nodes that get selected
                // from the search get updated to have a check box!
                function checkChildren(children) {
                    _.each(children, function (child) {
                        //check if the id is in the selection, if so ensure it's flagged as selected
                        var exists = _.find($scope.searchInfo.selectedSearchResults, function (selected) {
                            return child.id == selected.id;
                        });
                        //if the curr node exists in selected search results, ensure it's checked
                        if (exists) {
                            child.selected = true;
                        }    //if the curr node does not exist in the selected search result, and the curr node is a child of a list view search result
                        else if (child.metaData.isSearchResult) {
                            //if this tree node is under a list view it means that the node was added
                            // to the tree dynamically under the list view that was searched, so we actually want to remove
                            // it all together from the tree
                            var listView = child.parent();
                            listView.children = _.reject(listView.children, function (c) {
                                return c.id == child.id;
                            });
                        }
                        //check if the current node is a list view and if so, check if there's any new results
                        // that need to be added as child nodes to it based on search results selected
                        if (child.metaData.isContainer) {
                            child.cssClasses = _.reject(child.cssClasses, function (c) {
                                return c === 'tree-node-slide-up-hide-active';
                            });
                            var listViewResults = _.filter($scope.searchInfo.selectedSearchResults, function (i) {
                                return i.parentId == child.id;
                            });
                            _.each(listViewResults, function (item) {
                                var childExists = _.find(child.children, function (c) {
                                    return c.id == item.id;
                                });
                                if (!childExists) {
                                    var parent = child;
                                    child.children.unshift({
                                        id: item.id,
                                        name: item.name,
                                        cssClass: 'icon umb-tree-icon sprTree ' + item.icon,
                                        level: child.level + 1,
                                        metaData: { isSearchResult: true },
                                        hasChildren: false,
                                        parent: function () {
                                            return parent;
                                        }
                                    });
                                }
                            });
                        }
                        //recurse
                        if (child.children && child.children.length > 0) {
                            checkChildren(child.children);
                        }
                    });
                }
                checkChildren(tree.root.children);
            }
            $scope.searchInfo.showSearch = false;
            $scope.searchInfo.searchFromId = dialogOptions.startNodeId;
            $scope.searchInfo.searchFromName = null;
            $scope.searchInfo.results = [];
        };
        $scope.onSearchResults = function (results) {
            //filter all items - this will mark an item as filtered
            performFiltering(results);
            //now actually remove all filtered items so they are not even displayed
            results = _.filter(results, function (item) {
                return !item.filtered;
            });
            $scope.searchInfo.results = results;
            //sync with the curr selected results
            _.each($scope.searchInfo.results, function (result) {
                var exists = _.find($scope.dialogData.selection, function (selectedId) {
                    return result.id == selectedId;
                });
                if (exists) {
                    result.selected = true;
                }
            });
            $scope.searchInfo.showSearch = true;
        };
        $scope.dialogTreeEventHandler.bind('treeLoaded', treeLoadedHandler);
        $scope.dialogTreeEventHandler.bind('treeNodeExpanded', nodeExpandedHandler);
        $scope.dialogTreeEventHandler.bind('treeNodeSelect', nodeSelectHandler);
        $scope.$on('$destroy', function () {
            $scope.dialogTreeEventHandler.unbind('treeLoaded', treeLoadedHandler);
            $scope.dialogTreeEventHandler.unbind('treeNodeExpanded', nodeExpandedHandler);
            $scope.dialogTreeEventHandler.unbind('treeNodeSelect', nodeSelectHandler);
        });
    });
    angular.module('umbraco').controller('Umbraco.Dialogs.UserController', function ($scope, $location, $timeout, userService, historyService, eventsService, externalLoginInfo, authResource, currentUserResource, formHelper) {
        $scope.history = historyService.getCurrent();
        $scope.version = Umbraco.Sys.ServerVariables.application.version + ' assembly: ' + Umbraco.Sys.ServerVariables.application.assemblyVersion;
        $scope.showPasswordFields = false;
        $scope.changePasswordButtonState = 'init';
        $scope.externalLoginProviders = externalLoginInfo.providers;
        $scope.externalLinkLoginFormAction = Umbraco.Sys.ServerVariables.umbracoUrls.externalLinkLoginsUrl;
        var evts = [];
        evts.push(eventsService.on('historyService.add', function (e, args) {
            $scope.history = args.all;
        }));
        evts.push(eventsService.on('historyService.remove', function (e, args) {
            $scope.history = args.all;
        }));
        evts.push(eventsService.on('historyService.removeAll', function (e, args) {
            $scope.history = [];
        }));
        $scope.logout = function () {
            //Add event listener for when there are pending changes on an editor which means our route was not successful
            var pendingChangeEvent = eventsService.on('valFormManager.pendingChanges', function (e, args) {
                //one time listener, remove the event
                pendingChangeEvent();
                $scope.close();
            });
            //perform the path change, if it is successful then the promise will resolve otherwise it will fail
            $scope.close();
            $location.path('/logout');
        };
        $scope.gotoHistory = function (link) {
            $location.path(link);
            $scope.close();
        };
        //Manually update the remaining timeout seconds
        function updateTimeout() {
            $timeout(function () {
                if ($scope.remainingAuthSeconds > 0) {
                    $scope.remainingAuthSeconds--;
                    $scope.$digest();
                    //recurse
                    updateTimeout();
                }
            }, 1000, false);    // 1 second, do NOT execute a global digest
        }
        function updateUserInfo() {
            //get the user
            userService.getCurrentUser().then(function (user) {
                $scope.user = user;
                if ($scope.user) {
                    $scope.remainingAuthSeconds = $scope.user.remainingAuthSeconds;
                    $scope.canEditProfile = _.indexOf($scope.user.allowedSections, 'users') > -1;
                    //set the timer
                    updateTimeout();
                    authResource.getCurrentUserLinkedLogins().then(function (logins) {
                        //reset all to be un-linked
                        for (var provider in $scope.externalLoginProviders) {
                            $scope.externalLoginProviders[provider].linkedProviderKey = undefined;
                        }
                        //set the linked logins
                        for (var login in logins) {
                            var found = _.find($scope.externalLoginProviders, function (i) {
                                return i.authType == login;
                            });
                            if (found) {
                                found.linkedProviderKey = logins[login];
                            }
                        }
                    });
                }
            });
        }
        $scope.unlink = function (e, loginProvider, providerKey) {
            var result = confirm('Are you sure you want to unlink this account?');
            if (!result) {
                e.preventDefault();
                return;
            }
            authResource.unlinkLogin(loginProvider, providerKey).then(function (a, b, c) {
                updateUserInfo();
            });
        };
        updateUserInfo();
        //remove all event handlers
        $scope.$on('$destroy', function () {
            for (var e = 0; e < evts.length; e++) {
                evts[e]();
            }
        });
        /* ---------- UPDATE PASSWORD ---------- */
        //create the initial model for change password property editor
        $scope.changePasswordModel = {
            alias: '_umb_password',
            view: 'changepassword',
            config: {},
            value: {}
        };
        //go get the config for the membership provider and add it to the model
        authResource.getMembershipProviderConfig().then(function (data) {
            $scope.changePasswordModel.config = data;
            //ensure the hasPassword config option is set to true (the user of course has a password already assigned)
            //this will ensure the oldPassword is shown so they can change it
            // disable reset password functionality beacuse it does not make sense for the current user.
            $scope.changePasswordModel.config.hasPassword = true;
            $scope.changePasswordModel.config.disableToggle = true;
            $scope.changePasswordModel.config.enableReset = false;
        });
        $scope.changePassword = function () {
            if (formHelper.submitForm({ scope: $scope })) {
                $scope.changePasswordButtonState = 'busy';
                currentUserResource.changePassword($scope.changePasswordModel.value).then(function (data) {
                    //if the password has been reset, then update our model
                    if (data.value) {
                        $scope.changePasswordModel.value.generatedPassword = data.value;
                    }
                    formHelper.resetForm({
                        scope: $scope,
                        notifications: data.notifications
                    });
                    $scope.changePasswordButtonState = 'success';
                }, function (err) {
                    formHelper.handleError(err);
                    $scope.changePasswordButtonState = 'error';
                });
            }
        };
        $scope.togglePasswordFields = function () {
            clearPasswordFields();
            $scope.showPasswordFields = !$scope.showPasswordFields;
        };
        function clearPasswordFields() {
            $scope.changePasswordModel.value.newPassword = '';
            $scope.changePasswordModel.confirm = '';
        }
    });
    /**
 * @ngdoc controller
 * @name Umbraco.Dialogs.LegacyDeleteController
 * @function
 * 
 * @description
 * The controller for deleting content
 */
    function YsodController($scope, legacyResource, treeService, navigationService) {
        if ($scope.error && $scope.error.data && $scope.error.data.StackTrace) {
            //trim whitespace
            $scope.error.data.StackTrace = $scope.error.data.StackTrace.trim();
        }
        $scope.closeDialog = function () {
            $scope.dismiss();
        };
    }
    angular.module('umbraco').controller('Umbraco.Dialogs.YsodController', YsodController);
    (function () {
        'use strict';
        function HelpDrawerController($scope, $routeParams, $timeout, dashboardResource, localizationService, userService, eventsService, helpService, appState, tourService, $filter) {
            var vm = this;
            var evts = [];
            vm.title = localizationService.localize('general_help');
            vm.subtitle = 'Umbraco version' + ' ' + Umbraco.Sys.ServerVariables.application.version;
            vm.section = $routeParams.section;
            vm.tree = $routeParams.tree;
            vm.sectionName = '';
            vm.customDashboard = null;
            vm.tours = [];
            vm.closeDrawer = closeDrawer;
            vm.startTour = startTour;
            vm.getTourGroupCompletedPercentage = getTourGroupCompletedPercentage;
            vm.showTourButton = showTourButton;
            function startTour(tour) {
                tourService.startTour(tour);
                closeDrawer();
            }
            function oninit() {
                tourService.getGroupedTours().then(function (groupedTours) {
                    vm.tours = groupedTours;
                    getTourGroupCompletedPercentage();
                });
                // load custom help dashboard
                dashboardResource.getDashboard('user-help').then(function (dashboard) {
                    vm.customDashboard = dashboard;
                });
                if (!vm.section) {
                    vm.section = 'content';
                }
                setSectionName();
                userService.getCurrentUser().then(function (user) {
                    vm.userType = user.userType;
                    vm.userLang = user.locale;
                    vm.hasAccessToSettings = _.contains(user.allowedSections, 'settings');
                    evts.push(eventsService.on('appState.treeState.changed', function (e, args) {
                        handleSectionChange();
                    }));
                    findHelp(vm.section, vm.tree, vm.userType, vm.userLang);
                });
                // check if a tour is running - if it is open the matching group
                var currentTour = tourService.getCurrentTour();
                if (currentTour) {
                    openTourGroup(currentTour.alias);
                }
            }
            function closeDrawer() {
                appState.setDrawerState('showDrawer', false);
            }
            function handleSectionChange() {
                $timeout(function () {
                    if (vm.section !== $routeParams.section || vm.tree !== $routeParams.tree) {
                        vm.section = $routeParams.section;
                        vm.tree = $routeParams.tree;
                        setSectionName();
                        findHelp(vm.section, vm.tree, vm.userType, vm.userLang);
                    }
                });
            }
            function findHelp(section, tree, usertype, userLang) {
                if (vm.hasAccessToSettings) {
                    helpService.getContextHelpForPage(section, tree).then(function (topics) {
                        vm.topics = topics;
                    });
                }
                var rq = {};
                rq.section = vm.section;
                rq.usertype = usertype;
                rq.lang = userLang;
                if ($routeParams.url) {
                    rq.path = decodeURIComponent($routeParams.url);
                    if (rq.path.indexOf(Umbraco.Sys.ServerVariables.umbracoSettings.umbracoPath) === 0) {
                        rq.path = rq.path.substring(Umbraco.Sys.ServerVariables.umbracoSettings.umbracoPath.length);
                    }
                    if (rq.path.indexOf('.aspx') > 0) {
                        rq.path = rq.path.substring(0, rq.path.indexOf('.aspx'));
                    }
                } else {
                    rq.path = rq.section + '/' + $routeParams.tree + '/' + $routeParams.method;
                }
                if (vm.hasAccessToSettings) {
                    helpService.findVideos(rq).then(function (videos) {
                        vm.videos = videos;
                    });
                }
            }
            function setSectionName() {
                // Get section name
                var languageKey = 'sections_' + vm.section;
                localizationService.localize(languageKey).then(function (value) {
                    vm.sectionName = value;
                });
            }
            function showTourButton(index, tourGroup) {
                if (index !== 0) {
                    var prevTour = tourGroup.tours[index - 1];
                    if (prevTour.completed) {
                        return true;
                    }
                } else {
                    return true;
                }
            }
            function openTourGroup(tourAlias) {
                angular.forEach(vm.tours, function (group) {
                    angular.forEach(group, function (tour) {
                        if (tour.alias === tourAlias) {
                            group.open = true;
                        }
                    });
                });
            }
            function getTourGroupCompletedPercentage() {
                // Finding out, how many tours are completed for the progress circle
                angular.forEach(vm.tours, function (group) {
                    var completedTours = 0;
                    angular.forEach(group.tours, function (tour) {
                        if (tour.completed) {
                            completedTours++;
                        }
                    });
                    group.completedPercentage = Math.round(completedTours / group.tours.length * 100);
                });
            }
            evts.push(eventsService.on('appState.tour.complete', function (event, tour) {
                tourService.getGroupedTours().then(function (groupedTours) {
                    vm.tours = groupedTours;
                    openTourGroup(tour.alias);
                    getTourGroupCompletedPercentage();
                });
            }));
            $scope.$on('$destroy', function () {
                for (var e in evts) {
                    eventsService.unsubscribe(evts[e]);
                }
            });
            oninit();
        }
        angular.module('umbraco').controller('Umbraco.Drawers.Help', HelpDrawerController);
    }());
    /**
 * @ngdoc controller
 * @name Umbraco.LegacyController
 * @function
 * 
 * @description
 * A controller to control the legacy iframe injection
 * 
*/
    function LegacyController($scope, $routeParams, $element) {
        var url = decodeURIComponent($routeParams.url.replace(/javascript\:/gi, ''));
        //split into path and query
        var urlParts = url.split('?');
        var extIndex = urlParts[0].lastIndexOf('.');
        var ext = extIndex === -1 ? '' : urlParts[0].substr(extIndex);
        //path cannot be a js file
        if (ext !== '.js' || ext === '') {
            //path cannot contain any of these chars
            var toClean = '*(){}[];:<>\\|\'"';
            for (var i = 0; i < toClean.length; i++) {
                var reg = new RegExp('\\' + toClean[i], 'g');
                urlParts[0] = urlParts[0].replace(reg, '');
            }
            //join cleaned path and query back together
            url = urlParts[0] + (urlParts.length === 1 ? '' : '?' + urlParts[1]);
            $scope.legacyPath = url;
        } else {
            throw 'Invalid url';
        }
    }
    angular.module('umbraco').controller('Umbraco.LegacyController', LegacyController);
    /** This controller is simply here to launch the login dialog when the route is explicitly changed to /login */
    angular.module('umbraco').controller('Umbraco.LoginController', function (eventsService, $scope, userService, $location, $rootScope) {
        userService._showLoginDialog();
        var evtOn = eventsService.on('app.ready', function (evt, data) {
            $scope.avatar = 'assets/img/application/logo.png';
            var path = '/';
            //check if there's a returnPath query string, if so redirect to it
            var locationObj = $location.search();
            if (locationObj.returnPath) {
                path = decodeURIComponent(locationObj.returnPath);
            }
            $location.url(path);
        });
        $scope.$on('$destroy', function () {
            eventsService.unsubscribe(evtOn);
        });
    });
    //used for the media picker dialog
    angular.module('umbraco').controller('Umbraco.Notifications.ConfirmRouteChangeController', function ($scope, $location, $log, notificationsService) {
        $scope.discard = function (not) {
            not.args.listener();
            $location.search('');
            //we need to break the path up into path and query
            var parts = not.args.path.split('?');
            var query = {};
            if (parts.length > 1) {
                _.each(parts[1].split('&'), function (q) {
                    var keyVal = q.split('=');
                    query[keyVal[0]] = keyVal[1];
                });
            }
            $location.path(parts[0]).search(query);
            notificationsService.remove(not);
        };
        $scope.stay = function (not) {
            notificationsService.remove(not);
        };
    });
    angular.module('umbraco').controller('Umbraco.Notifications.ConfirmUnpublishController', function ($scope, notificationsService, eventsService) {
        $scope.confirm = function (not, action) {
            eventsService.emit('content.confirmUnpublish', action);
            notificationsService.remove(not);
        };
    });
    (function () {
        'use strict';
        function CompositionsOverlay($scope, $location, $filter) {
            var vm = this;
            vm.isSelected = isSelected;
            vm.openContentType = openContentType;
            // group the content types by their container paths
            vm.availableGroups = $filter('orderBy')(_.map(_.groupBy($scope.model.availableCompositeContentTypes, function (compositeContentType) {
                return compositeContentType.contentType.metaData.containerPath;
            }), function (group) {
                return {
                    containerPath: group[0].contentType.metaData.containerPath,
                    compositeContentTypes: group
                };
            }), function (group) {
                return group.containerPath.replace(/\//g, ' ');
            });
            function isSelected(alias) {
                if ($scope.model.contentType.compositeContentTypes.indexOf(alias) !== -1) {
                    return true;
                }
            }
            function openContentType(contentType, section) {
                var url = (section === 'documentType' ? '/settings/documenttypes/edit/' : '/settings/mediaTypes/edit/') + contentType.id;
                $location.path(url);
            }
        }
        angular.module('umbraco').controller('Umbraco.Overlays.CompositionsOverlay', CompositionsOverlay);
    }());
    /**
 * @ngdoc controller
 * @name Umbraco.Editors.DocumentType.PropertyController
 * @function
 *
 * @description
 * The controller for the content type editor property dialog
 */
    (function () {
        'use strict';
        function EditorPickerOverlay($scope, dataTypeResource, dataTypeHelper, contentTypeResource, localizationService) {
            var vm = this;
            if (!$scope.model.title) {
                $scope.model.title = localizationService.localize('defaultdialogs_selectEditor');
            }
            vm.searchTerm = '';
            vm.showTabs = false;
            vm.tabsLoaded = 0;
            vm.typesAndEditors = [];
            vm.userConfigured = [];
            vm.loading = false;
            vm.tabs = [
                {
                    active: true,
                    id: 1,
                    label: localizationService.localize('contentTypeEditor_availableEditors'),
                    alias: 'Default',
                    typesAndEditors: []
                },
                {
                    active: false,
                    id: 2,
                    label: localizationService.localize('contentTypeEditor_reuse'),
                    alias: 'Reuse',
                    userConfigured: []
                }
            ];
            vm.filterItems = filterItems;
            vm.showDetailsOverlay = showDetailsOverlay;
            vm.hideDetailsOverlay = hideDetailsOverlay;
            vm.pickEditor = pickEditor;
            vm.pickDataType = pickDataType;
            function activate() {
                getGroupedDataTypes();
                getGroupedPropertyEditors();
            }
            function getGroupedPropertyEditors() {
                vm.loading = true;
                dataTypeResource.getGroupedPropertyEditors().then(function (data) {
                    vm.tabs[0].typesAndEditors = data;
                    vm.typesAndEditors = data;
                    vm.tabsLoaded = vm.tabsLoaded + 1;
                    checkIfTabContentIsLoaded();
                });
            }
            function getGroupedDataTypes() {
                vm.loading = true;
                dataTypeResource.getGroupedDataTypes().then(function (data) {
                    vm.tabs[1].userConfigured = data;
                    vm.userConfigured = data;
                    vm.tabsLoaded = vm.tabsLoaded + 1;
                    checkIfTabContentIsLoaded();
                });
            }
            function checkIfTabContentIsLoaded() {
                if (vm.tabsLoaded === 2) {
                    vm.loading = false;
                    vm.showTabs = true;
                }
            }
            function filterItems() {
                // clear item details
                $scope.model.itemDetails = null;
                if (vm.searchTerm) {
                    vm.showFilterResult = true;
                    vm.showTabs = false;
                } else {
                    vm.showFilterResult = false;
                    vm.showTabs = true;
                }
            }
            function showDetailsOverlay(property) {
                var propertyDetails = {};
                propertyDetails.icon = property.icon;
                propertyDetails.title = property.name;
                $scope.model.itemDetails = propertyDetails;
            }
            function hideDetailsOverlay() {
                $scope.model.itemDetails = null;
            }
            function pickEditor(editor) {
                var parentId = -1;
                dataTypeResource.getScaffold(parentId).then(function (dataType) {
                    // set alias
                    dataType.selectedEditor = editor.alias;
                    // set name
                    var nameArray = [];
                    if ($scope.model.contentTypeName) {
                        nameArray.push($scope.model.contentTypeName);
                    }
                    if ($scope.model.property.label) {
                        nameArray.push($scope.model.property.label);
                    }
                    if (editor.name) {
                        nameArray.push(editor.name);
                    }
                    // make name
                    dataType.name = nameArray.join(' - ');
                    // get pre values
                    dataTypeResource.getPreValues(dataType.selectedEditor).then(function (preValues) {
                        dataType.preValues = preValues;
                        openEditorSettingsOverlay(dataType, true);
                    });
                });
            }
            function pickDataType(selectedDataType) {
                dataTypeResource.getById(selectedDataType.id).then(function (dataType) {
                    contentTypeResource.getPropertyTypeScaffold(dataType.id).then(function (propertyType) {
                        submitOverlay(dataType, propertyType, false);
                    });
                });
            }
            function openEditorSettingsOverlay(dataType, isNew) {
                vm.editorSettingsOverlay = {
                    title: localizationService.localize('contentTypeEditor_editorSettings'),
                    dataType: dataType,
                    view: 'views/common/overlays/contenttypeeditor/editorsettings/editorsettings.html',
                    show: true,
                    submit: function (model) {
                        var preValues = dataTypeHelper.createPreValueProps(model.dataType.preValues);
                        dataTypeResource.save(model.dataType, preValues, isNew).then(function (newDataType) {
                            contentTypeResource.getPropertyTypeScaffold(newDataType.id).then(function (propertyType) {
                                submitOverlay(newDataType, propertyType, true);
                                vm.editorSettingsOverlay.show = false;
                                vm.editorSettingsOverlay = null;
                            });
                        });
                    }
                };
            }
            function submitOverlay(dataType, propertyType, isNew) {
                // update property
                $scope.model.property.config = propertyType.config;
                $scope.model.property.editor = propertyType.editor;
                $scope.model.property.view = propertyType.view;
                $scope.model.property.dataTypeId = dataType.id;
                $scope.model.property.dataTypeIcon = dataType.icon;
                $scope.model.property.dataTypeName = dataType.name;
                $scope.model.updateSameDataTypes = isNew;
                $scope.model.submit($scope.model);
            }
            activate();
        }
        angular.module('umbraco').controller('Umbraco.Overlays.EditorPickerOverlay', EditorPickerOverlay);
    }());
    /**
 * @ngdoc controller
 * @name Umbraco.Editors.DocumentType.PropertyController
 * @function
 *
 * @description
 * The controller for the content type editor property dialog
 */
    (function () {
        'use strict';
        function PropertySettingsOverlay($scope, contentTypeResource, dataTypeResource, dataTypeHelper, localizationService, userService) {
            var vm = this;
            vm.showValidationPattern = false;
            vm.focusOnPatternField = false;
            vm.focusOnMandatoryField = false;
            vm.selectedValidationType = {};
            vm.validationTypes = [
                {
                    'name': localizationService.localize('validation_validateAsEmail'),
                    'key': 'email',
                    'pattern': '[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+.[a-zA-Z0-9-.]+',
                    'enableEditing': true
                },
                {
                    'name': localizationService.localize('validation_validateAsNumber'),
                    'key': 'number',
                    'pattern': '^[0-9]*$',
                    'enableEditing': true
                },
                {
                    'name': localizationService.localize('validation_validateAsUrl'),
                    'key': 'url',
                    'pattern': 'https?://[a-zA-Z0-9-.]+.[a-zA-Z]{2,}',
                    'enableEditing': true
                },
                {
                    'name': localizationService.localize('validation_enterCustomValidation'),
                    'key': 'custom',
                    'pattern': '',
                    'enableEditing': true
                }
            ];
            vm.changeValidationType = changeValidationType;
            vm.changeValidationPattern = changeValidationPattern;
            vm.openEditorPickerOverlay = openEditorPickerOverlay;
            vm.openEditorSettingsOverlay = openEditorSettingsOverlay;
            userService.getCurrentUser().then(function (user) {
                vm.showSensitiveData = user.userGroups.indexOf('sensitiveData') != -1;
            });
            function activate() {
                matchValidationType();
            }
            function changeValidationPattern() {
                matchValidationType();
            }
            function openEditorPickerOverlay(property) {
                vm.focusOnMandatoryField = false;
                vm.editorPickerOverlay = {};
                vm.editorPickerOverlay.property = $scope.model.property;
                vm.editorPickerOverlay.contentTypeName = $scope.model.contentTypeName;
                vm.editorPickerOverlay.view = 'views/common/overlays/contenttypeeditor/editorpicker/editorpicker.html';
                vm.editorPickerOverlay.show = true;
                vm.editorPickerOverlay.submit = function (model) {
                    $scope.model.updateSameDataTypes = model.updateSameDataTypes;
                    vm.focusOnMandatoryField = true;
                    // update property
                    property.config = model.property.config;
                    property.editor = model.property.editor;
                    property.view = model.property.view;
                    property.dataTypeId = model.property.dataTypeId;
                    property.dataTypeIcon = model.property.dataTypeIcon;
                    property.dataTypeName = model.property.dataTypeName;
                    vm.editorPickerOverlay.show = false;
                    vm.editorPickerOverlay = null;
                };
                vm.editorPickerOverlay.close = function (model) {
                    vm.editorPickerOverlay.show = false;
                    vm.editorPickerOverlay = null;
                };
            }
            function openEditorSettingsOverlay(property) {
                vm.focusOnMandatoryField = false;
                // get data type
                dataTypeResource.getById(property.dataTypeId).then(function (dataType) {
                    vm.editorSettingsOverlay = {};
                    vm.editorSettingsOverlay.title = 'Editor settings';
                    vm.editorSettingsOverlay.view = 'views/common/overlays/contenttypeeditor/editorsettings/editorsettings.html';
                    vm.editorSettingsOverlay.dataType = dataType;
                    vm.editorSettingsOverlay.show = true;
                    vm.editorSettingsOverlay.submit = function (model) {
                        var preValues = dataTypeHelper.createPreValueProps(model.dataType.preValues);
                        dataTypeResource.save(model.dataType, preValues, false).then(function (newDataType) {
                            contentTypeResource.getPropertyTypeScaffold(newDataType.id).then(function (propertyType) {
                                // update editor
                                property.config = propertyType.config;
                                property.editor = propertyType.editor;
                                property.view = propertyType.view;
                                property.dataTypeId = newDataType.id;
                                property.dataTypeIcon = newDataType.icon;
                                property.dataTypeName = newDataType.name;
                                // set flag to update same data types
                                $scope.model.updateSameDataTypes = true;
                                vm.focusOnMandatoryField = true;
                                vm.editorSettingsOverlay.show = false;
                                vm.editorSettingsOverlay = null;
                            });
                        });
                    };
                    vm.editorSettingsOverlay.close = function (oldModel) {
                        vm.editorSettingsOverlay.show = false;
                        vm.editorSettingsOverlay = null;
                    };
                });
            }
            function matchValidationType() {
                if ($scope.model.property.validation.pattern !== null && $scope.model.property.validation.pattern !== '' && $scope.model.property.validation.pattern !== undefined) {
                    var match = false;
                    // find and show if a match from the list has been chosen
                    angular.forEach(vm.validationTypes, function (validationType, index) {
                        if ($scope.model.property.validation.pattern === validationType.pattern) {
                            vm.selectedValidationType = vm.validationTypes[index];
                            vm.showValidationPattern = true;
                            match = true;
                        }
                    });
                    // if there is no match - choose the custom validation option.
                    if (!match) {
                        angular.forEach(vm.validationTypes, function (validationType) {
                            if (validationType.key === 'custom') {
                                vm.selectedValidationType = validationType;
                                vm.showValidationPattern = true;
                            }
                        });
                    }
                }
            }
            function changeValidationType(selectedValidationType) {
                if (selectedValidationType) {
                    $scope.model.property.validation.pattern = selectedValidationType.pattern;
                    vm.showValidationPattern = true;
                    // set focus on textarea
                    if (selectedValidationType.key === 'custom') {
                        vm.focusOnPatternField = true;
                    }
                } else {
                    $scope.model.property.validation.pattern = '';
                    vm.showValidationPattern = false;
                }
            }
            activate();
        }
        angular.module('umbraco').controller('Umbraco.Overlay.PropertySettingsOverlay', PropertySettingsOverlay);
    }());
    (function () {
        'use strict';
        function CopyOverlay($scope, localizationService, eventsService, entityHelper) {
            var vm = this;
            if (!$scope.model.title) {
                $scope.model.title = localizationService.localize('general_copy');
            }
            vm.hideSearch = hideSearch;
            vm.selectResult = selectResult;
            vm.onSearchResults = onSearchResults;
            var dialogOptions = $scope.model;
            var searchText = 'Search...';
            var node = dialogOptions.currentNode;
            localizationService.localize('general_search').then(function (value) {
                searchText = value + '...';
            });
            $scope.model.relateToOriginal = true;
            $scope.dialogTreeEventHandler = $({});
            vm.searchInfo = {
                searchFromId: null,
                searchFromName: null,
                showSearch: false,
                results: [],
                selectedSearchResults: []
            };
            // get entity type based on the section
            $scope.entityType = entityHelper.getEntityTypeFromSection(dialogOptions.section);
            function nodeSelectHandler(ev, args) {
                if (args && args.event) {
                    args.event.preventDefault();
                    args.event.stopPropagation();
                }
                //eventsService.emit("editors.content.copyController.select", args);
                if ($scope.model.target) {
                    //un-select if there's a current one selected
                    $scope.model.target.selected = false;
                }
                $scope.model.target = args.node;
                $scope.model.target.selected = true;
            }
            function nodeExpandedHandler(ev, args) {
                // open mini list view for list views
                if (args.node.metaData.isContainer) {
                    openMiniListView(args.node);
                }
            }
            function hideSearch() {
                vm.searchInfo.showSearch = false;
                vm.searchInfo.searchFromId = null;
                vm.searchInfo.searchFromName = null;
                vm.searchInfo.results = [];
            }
            // method to select a search result
            function selectResult(evt, result) {
                result.selected = result.selected === true ? false : true;
                nodeSelectHandler(evt, {
                    event: evt,
                    node: result
                });
            }
            //callback when there are search results
            function onSearchResults(results) {
                vm.searchInfo.results = results;
                vm.searchInfo.showSearch = true;
            }
            $scope.dialogTreeEventHandler.bind('treeNodeSelect', nodeSelectHandler);
            $scope.dialogTreeEventHandler.bind('treeNodeExpanded', nodeExpandedHandler);
            $scope.$on('$destroy', function () {
                $scope.dialogTreeEventHandler.unbind('treeNodeSelect', nodeSelectHandler);
                $scope.dialogTreeEventHandler.unbind('treeNodeExpanded', nodeExpandedHandler);
            });
            // Mini list view
            $scope.selectListViewNode = function (node) {
                node.selected = node.selected === true ? false : true;
                nodeSelectHandler({}, { node: node });
            };
            $scope.closeMiniListView = function () {
                $scope.miniListView = undefined;
            };
            function openMiniListView(node) {
                $scope.miniListView = node;
            }
        }
        angular.module('umbraco').controller('Umbraco.Overlays.CopyOverlay', CopyOverlay);
    }());
    (function () {
        'use strict';
        function EmbedOverlay($scope, $http, umbRequestHelper, localizationService) {
            var vm = this;
            var origWidth = 500;
            var origHeight = 300;
            if (!$scope.model.title) {
                $scope.model.title = localizationService.localize('general_embed');
            }
            $scope.model.embed = {
                url: '',
                width: 360,
                height: 240,
                constrain: true,
                preview: '',
                success: false,
                info: '',
                supportsDimensions: ''
            };
            vm.showPreview = showPreview;
            vm.changeSize = changeSize;
            function showPreview() {
                if ($scope.model.embed.url) {
                    $scope.model.embed.show = true;
                    $scope.model.embed.preview = '<div class="umb-loader" style="height: 10px; margin: 10px 0px;"></div>';
                    $scope.model.embed.info = '';
                    $scope.model.embed.success = false;
                    $http({
                        method: 'GET',
                        url: umbRequestHelper.getApiUrl('embedApiBaseUrl', 'GetEmbed'),
                        params: {
                            url: $scope.model.embed.url,
                            width: $scope.model.embed.width,
                            height: $scope.model.embed.height
                        }
                    }).success(function (data) {
                        $scope.model.embed.preview = '';
                        switch (data.Status) {
                        case 0:
                            //not supported
                            $scope.model.embed.info = 'Not supported';
                            break;
                        case 1:
                            //error
                            $scope.model.embed.info = 'Could not embed media - please ensure the URL is valid';
                            break;
                        case 2:
                            $scope.model.embed.preview = data.Markup;
                            $scope.model.embed.supportsDimensions = data.SupportsDimensions;
                            $scope.model.embed.success = true;
                            break;
                        }
                    }).error(function () {
                        $scope.model.embed.supportsDimensions = false;
                        $scope.model.embed.preview = '';
                        $scope.model.embed.info = 'Could not embed media - please ensure the URL is valid';
                    });
                } else {
                    $scope.model.embed.supportsDimensions = false;
                    $scope.model.embed.preview = '';
                    $scope.model.embed.info = 'Please enter a URL';
                }
            }
            function changeSize(type) {
                var width, height;
                if ($scope.model.embed.constrain) {
                    width = parseInt($scope.model.embed.width, 10);
                    height = parseInt($scope.model.embed.height, 10);
                    if (type == 'width') {
                        origHeight = Math.round(width / origWidth * height);
                        $scope.model.embed.height = origHeight;
                    } else {
                        origWidth = Math.round(height / origHeight * width);
                        $scope.model.embed.width = origWidth;
                    }
                }
                if ($scope.model.embed.url !== '') {
                    showPreview();
                }
            }
        }
        angular.module('umbraco').controller('Umbraco.Overlays.EmbedOverlay', EmbedOverlay);
    }());
    angular.module('umbraco').controller('Umbraco.Overlays.HelpController', function ($scope, $location, $routeParams, helpService, userService, localizationService) {
        $scope.section = $routeParams.section;
        $scope.version = Umbraco.Sys.ServerVariables.application.version + ' assembly: ' + Umbraco.Sys.ServerVariables.application.assemblyVersion;
        $scope.model.subtitle = 'Umbraco version' + ' ' + $scope.version;
        if (!$scope.model.title) {
            $scope.model.title = localizationService.localize('general_help');
        }
        if (!$scope.section) {
            $scope.section = 'content';
        }
        $scope.sectionName = $scope.section;
        var rq = {};
        rq.section = $scope.section;
        //translate section name
        localizationService.localize('sections_' + rq.section).then(function (value) {
            $scope.sectionName = value;
        });
        userService.getCurrentUser().then(function (user) {
            rq.lang = user.locale;
            if ($routeParams.url) {
                rq.path = decodeURIComponent($routeParams.url);
                if (rq.path.indexOf(Umbraco.Sys.ServerVariables.umbracoSettings.umbracoPath) === 0) {
                    rq.path = rq.path.substring(Umbraco.Sys.ServerVariables.umbracoSettings.umbracoPath.length);
                }
                if (rq.path.indexOf('.aspx') > 0) {
                    rq.path = rq.path.substring(0, rq.path.indexOf('.aspx'));
                }
            } else {
                rq.path = rq.section + '/' + $routeParams.tree + '/' + $routeParams.method;
            }
            helpService.findHelp(rq).then(function (topics) {
                $scope.topics = topics;
            });
            helpService.findVideos(rq).then(function (videos) {
                $scope.videos = videos;
            });
        });
    });
    /**
 * @ngdoc controller
 * @name Umbraco.Editors.DocumentType.PropertyController
 * @function
 *
 * @description
 * The controller for the content type editor property dialog
 */
    function IconPickerOverlay($scope, iconHelper, localizationService) {
        $scope.loading = true;
        $scope.model.hideSubmitButton = false;
        $scope.colors = [
            {
                label: 'Black',
                value: 'color-black'
            },
            {
                label: 'Blue Grey',
                value: 'color-blue-grey'
            },
            {
                label: 'Grey',
                value: 'color-grey'
            },
            {
                label: 'Brown',
                value: 'color-brown'
            },
            {
                label: 'Blue',
                value: 'color-blue'
            },
            {
                label: 'Light Blue',
                value: 'color-light-blue'
            },
            {
                label: 'Indigo',
                value: 'color-indigo'
            },
            {
                label: 'Purple',
                value: 'color-purple'
            },
            {
                label: 'Deep Purple',
                value: 'color-deep-purple'
            },
            {
                label: 'Cyan',
                value: 'color-cyan'
            },
            {
                label: 'Green',
                value: 'color-green'
            },
            {
                label: 'Light Green',
                value: 'color-light-green'
            },
            {
                label: 'Lime',
                value: 'color-lime'
            },
            {
                label: 'Yellow',
                value: 'color-yellow'
            },
            {
                label: 'Amber',
                value: 'color-amber'
            },
            {
                label: 'Orange',
                value: 'color-orange'
            },
            {
                label: 'Deep Orange',
                value: 'color-deep-orange'
            },
            {
                label: 'Red',
                value: 'color-red'
            },
            {
                label: 'Pink',
                value: 'color-pink'
            }
        ];
        if (!$scope.color) {
            // Set default selected color to black
            $scope.color = $scope.colors[0].value;
        }
        ;
        if (!$scope.model.title) {
            $scope.model.title = localizationService.localize('defaultdialogs_selectIcon');
        }
        ;
        if ($scope.model.color) {
            $scope.color = $scope.model.color;
        }
        ;
        if ($scope.model.icon) {
            $scope.icon = $scope.model.icon;
        }
        ;
        iconHelper.getIcons().then(function (icons) {
            $scope.icons = icons;
            $scope.loading = false;
        });
        $scope.selectIcon = function (icon, color) {
            $scope.model.icon = icon;
            $scope.model.color = color;
            $scope.submitForm($scope.model);
        };
        var unsubscribe = $scope.$on('formSubmitting', function () {
            if ($scope.color) {
                $scope.model.color = $scope.color;
            }
        });
        //when the scope is destroyed we need to unsubscribe
        $scope.$on('$destroy', function () {
            unsubscribe();
        });
    }
    angular.module('umbraco').controller('Umbraco.Overlays.IconPickerOverlay', IconPickerOverlay);
    (function () {
        'use strict';
        function InsertOverlayController($scope, localizationService) {
            var vm = this;
            if (!$scope.model.title) {
                $scope.model.title = localizationService.localize('template_insert');
            }
            if (!$scope.model.subtitle) {
                $scope.model.subtitle = localizationService.localize('template_insertDesc');
            }
            vm.openMacroPicker = openMacroPicker;
            vm.openPageFieldOverlay = openPageFieldOverlay;
            vm.openDictionaryItemOverlay = openDictionaryItemOverlay;
            vm.openPartialOverlay = openPartialOverlay;
            function openMacroPicker() {
                vm.macroPickerOverlay = {
                    view: 'macropicker',
                    title: localizationService.localize('template_insertMacro'),
                    dialogData: {},
                    show: true,
                    submit: function (model) {
                        $scope.model.insert = {
                            'type': 'macro',
                            'macroParams': model.macroParams,
                            'selectedMacro': model.selectedMacro
                        };
                        $scope.model.submit($scope.model);
                        vm.macroPickerOverlay.show = false;
                        vm.macroPickerOverlay = null;
                    }
                };
            }
            function openPageFieldOverlay() {
                vm.pageFieldOverlay = {
                    title: localizationService.localize('template_insertPageField'),
                    description: localizationService.localize('template_insertPageFieldDesc'),
                    submitButtonLabel: 'Insert',
                    closeButtonlabel: 'Cancel',
                    view: 'insertfield',
                    show: true,
                    submit: function (model) {
                        $scope.model.insert = {
                            'type': 'umbracoField',
                            'umbracoField': model.umbracoField
                        };
                        $scope.model.submit($scope.model);
                        vm.pageFieldOverlay.show = false;
                        vm.pageFieldOverlay = null;
                    },
                    close: function (model) {
                        vm.pageFieldOverlay.show = false;
                        vm.pageFieldOverlay = null;
                    }
                };
            }
            function openDictionaryItemOverlay() {
                vm.dictionaryItemOverlay = {
                    view: 'treepicker',
                    section: 'settings',
                    treeAlias: 'dictionary',
                    entityType: 'dictionary',
                    multiPicker: false,
                    title: localizationService.localize('template_insertDictionaryItem'),
                    description: localizationService.localize('template_insertDictionaryItemDesc'),
                    emptyStateMessage: localizationService.localize('emptyStates_emptyDictionaryTree'),
                    show: true,
                    select: function (node) {
                        $scope.model.insert = {
                            'type': 'dictionary',
                            'node': node
                        };
                        $scope.model.submit($scope.model);
                        vm.dictionaryItemOverlay.show = false;
                        vm.dictionaryItemOverlay = null;
                    },
                    close: function (model) {
                        vm.dictionaryItemOverlay.show = false;
                        vm.dictionaryItemOverlay = null;
                    }
                };
            }
            function openPartialOverlay() {
                vm.partialItemOverlay = {
                    view: 'treepicker',
                    section: 'settings',
                    treeAlias: 'partialViews',
                    entityType: 'partialView',
                    multiPicker: false,
                    filter: function (i) {
                        if (i.name.indexOf('.cshtml') === -1 && i.name.indexOf('.vbhtml') === -1) {
                            return true;
                        }
                    },
                    filterCssClass: 'not-allowed',
                    title: localizationService.localize('template_insertPartialView'),
                    show: true,
                    select: function (node) {
                        $scope.model.insert = {
                            'type': 'partial',
                            'node': node
                        };
                        $scope.model.submit($scope.model);
                        vm.partialItemOverlay.show = false;
                        vm.partialItemOverlay = null;
                    },
                    close: function (model) {
                        vm.partialItemOverlay.show = false;
                        vm.partialItemOverlay = null;
                    }
                };
            }
        }
        angular.module('umbraco').controller('Umbraco.Overlays.InsertOverlay', InsertOverlayController);
    }());
    (function () {
        'use strict';
        function InsertFieldController($scope, $http, contentTypeResource) {
            var vm = this;
            vm.field;
            vm.altField;
            vm.altText;
            vm.insertBefore;
            vm.insertAfter;
            vm.recursive = false;
            vm.properties = [];
            vm.standardFields = [];
            vm.date = false;
            vm.dateTime = false;
            vm.dateTimeSeparator = '';
            vm.casingUpper = false;
            vm.casingLower = false;
            vm.encodeHtml = false;
            vm.encodeUrl = false;
            vm.convertLinebreaks = false;
            vm.showAltField = false;
            vm.showAltText = false;
            vm.setDateOption = setDateOption;
            vm.setCasingOption = setCasingOption;
            vm.setEncodingOption = setEncodingOption;
            vm.generateOutputSample = generateOutputSample;
            function onInit() {
                // set default title
                if (!$scope.model.title) {
                    $scope.model.title = 'Insert value';
                }
                // Load all fields
                contentTypeResource.getAllPropertyTypeAliases().then(function (array) {
                    vm.properties = array;
                });
                // Load all standard fields
                contentTypeResource.getAllStandardFields().then(function (array) {
                    vm.standardFields = array;
                });
            }
            // date formatting
            function setDateOption(option) {
                if (option === 'date') {
                    if (vm.date) {
                        vm.date = false;
                    } else {
                        vm.date = true;
                        vm.dateTime = false;
                    }
                }
                if (option === 'dateWithTime') {
                    if (vm.dateTime) {
                        vm.dateTime = false;
                    } else {
                        vm.date = false;
                        vm.dateTime = true;
                    }
                }
            }
            // casing formatting
            function setCasingOption(option) {
                if (option === 'uppercase') {
                    if (vm.casingUpper) {
                        vm.casingUpper = false;
                    } else {
                        vm.casingUpper = true;
                        vm.casingLower = false;
                    }
                }
                if (option === 'lowercase') {
                    if (vm.casingLower) {
                        vm.casingLower = false;
                    } else {
                        vm.casingUpper = false;
                        vm.casingLower = true;
                    }
                }
            }
            // encoding formatting
            function setEncodingOption(option) {
                if (option === 'html') {
                    if (vm.encodeHtml) {
                        vm.encodeHtml = false;
                    } else {
                        vm.encodeHtml = true;
                        vm.encodeUrl = false;
                    }
                }
                if (option === 'url') {
                    if (vm.encodeUrl) {
                        vm.encodeUrl = false;
                    } else {
                        vm.encodeHtml = false;
                        vm.encodeUrl = true;
                    }
                }
            }
            function generateOutputSample() {
                var pageField = (vm.field !== undefined ? '@Umbraco.Field("' + vm.field + '"' : '') + (vm.altField !== undefined ? ', altFieldAlias:"' + vm.altField + '"' : '') + (vm.altText !== undefined ? ', altText:"' + vm.altText + '"' : '') + (vm.insertBefore !== undefined ? ', insertBefore:"' + vm.insertBefore + '"' : '') + (vm.insertAfter !== undefined ? ', insertAfter:"' + vm.insertAfter + '"' : '') + (vm.recursive !== false ? ', recursive: ' + vm.recursive : '') + (vm.date !== false ? ', formatAsDate: ' + vm.date : '') + (vm.dateTime !== false ? ', formatAsDateWithTimeSeparator:"' + vm.dateTimeSeparator + '"' : '') + (vm.casingUpper !== false ? ', casing: ' + 'RenderFieldCaseType.Upper' : '') + (vm.casingLower !== false ? ', casing: ' + 'RenderFieldCaseType.Lower' : '') + (vm.encodeHtml !== false ? ', encoding: ' + 'RenderFieldEncodingType.Html' : '') + (vm.encodeUrl !== false ? ', encoding: ' + 'RenderFieldEncodingType.Url' : '') + (vm.convertLinebreaks !== false ? ', convertLineBreaks: ' + 'true' : '') + (vm.field ? ')' : '');
                $scope.model.umbracoField = pageField;
                return pageField;
            }
            onInit();
        }
        angular.module('umbraco').controller('Umbraco.Overlays.InsertFieldController', InsertFieldController);
    }());
    function ItemPickerOverlay($scope, localizationService) {
        if (!$scope.model.title) {
            $scope.model.title = localizationService.localize('defaultdialogs_selectItem');
        }
        if (!$scope.model.orderBy) {
            $scope.model.orderBy = 'name';
        }
        $scope.model.hideSubmitButton = true;
        $scope.selectItem = function (item) {
            $scope.model.selectedItem = item;
            $scope.submitForm($scope.model);
        };
    }
    angular.module('umbraco').controller('Umbraco.Overlays.ItemPickerOverlay', ItemPickerOverlay);
    //used for the media picker dialog
    angular.module('umbraco').controller('Umbraco.Overlays.LinkPickerController', function ($scope, eventsService, dialogService, entityResource, mediaHelper, userService, localizationService, tinyMceService) {
        var dialogOptions = $scope.model;
        var searchText = 'Search...';
        localizationService.localize('general_search').then(function (value) {
            searchText = value + '...';
        });
        if (!$scope.model.title) {
            $scope.model.title = localizationService.localize('defaultdialogs_selectLink');
        }
        var dataTypeId = null;
        if (dialogOptions && dialogOptions.dataTypeId) {
            dataTypeId = dialogOptions.dataTypeId;
        }
        $scope.dialogTreeEventHandler = $({});
        $scope.model.target = {};
        $scope.searchInfo = {
            searchFromId: null,
            searchFromName: null,
            showSearch: false,
            dataTypeId: dataTypeId,
            results: [],
            selectedSearchResults: []
        };
        $scope.customTreeParams = dataTypeId !== null ? 'dataTypeId=' + dataTypeId : '';
        $scope.showTarget = $scope.model.hideTarget !== true;
        if (dialogOptions.currentTarget) {
            // clone the current target so we don't accidentally update the caller's model while manipulating $scope.model.target
            $scope.model.target = angular.copy(dialogOptions.currentTarget);
            //if we have a node ID, we fetch the current node to build the form data
            if ($scope.model.target.id || $scope.model.target.udi) {
                //will be either a udi or an int
                var id = $scope.model.target.udi ? $scope.model.target.udi : $scope.model.target.id;
                // is it a content link?
                if (!$scope.model.target.isMedia) {
                    // get the content path
                    entityResource.getPath(id, 'Document').then(function (path) {
                        //now sync the tree to this path
                        $scope.dialogTreeEventHandler.syncTree({
                            path: path,
                            tree: 'content'
                        });
                    });
                    entityResource.getUrlAndAnchors(id).then(function (resp) {
                        $scope.anchorValues = resp.anchorValues;
                        $scope.model.target.url = resp.url;
                    });
                }
            } else if ($scope.model.target.url.length) {
                // a url but no id/udi indicates an external link - trim the url to remove the anchor/qs
                // only do the substring if there's a # or a ?
                var indexOfAnchor = $scope.model.target.url.search(/(#|\?)/);
                if (indexOfAnchor > -1) {
                    // populate the anchor
                    $scope.model.target.anchor = $scope.model.target.url.substring(indexOfAnchor);
                    // then rewrite the model and populate the link
                    $scope.model.target.url = $scope.model.target.url.substring(0, indexOfAnchor);
                }
            }
        } else if (dialogOptions.anchors) {
            $scope.anchorValues = dialogOptions.anchors;
        }
        function nodeSelectHandler(ev, args) {
            if (args && args.event) {
                args.event.preventDefault();
                args.event.stopPropagation();
            }
            eventsService.emit('dialogs.linkPicker.select', args);
            if ($scope.currentNode) {
                //un-select if there's a current one selected
                $scope.currentNode.selected = false;
            }
            $scope.currentNode = args.node;
            $scope.currentNode.selected = true;
            $scope.model.target.id = args.node.id;
            $scope.model.target.udi = args.node.udi;
            $scope.model.target.name = args.node.name;
            if (args.node.id < 0) {
                $scope.model.target.url = '/';
            } else {
                entityResource.getUrlAndAnchors(args.node.id).then(function (resp) {
                    $scope.anchorValues = resp.anchorValues;
                    $scope.model.target.url = resp.url;
                });
            }
            if (!angular.isUndefined($scope.model.target.isMedia)) {
                delete $scope.model.target.isMedia;
            }
        }
        function nodeExpandedHandler(ev, args) {
            // open mini list view for list views
            if (args.node.metaData.isContainer) {
                openMiniListView(args.node);
            }
        }
        $scope.switchToMediaPicker = function () {
            userService.getCurrentUser().then(function (userData) {
                var startNodeId = userData.startMediaIds.length !== 1 ? -1 : userData.startMediaIds[0];
                var startNodeIsVirtual = userData.startMediaIds.length !== 1;
                if (dialogOptions.ignoreUserStartNodes) {
                    startNodeId = -1;
                    startNodeIsVirtual = true;
                }
                $scope.mediaPickerOverlay = {
                    view: 'mediapicker',
                    startNodeId: startNodeId,
                    startNodeIsVirtual: startNodeIsVirtual,
                    show: true,
                    dataTypeId: dataTypeId,
                    submit: function (model) {
                        var media = model.selectedImages[0];
                        $scope.model.target.id = media.id;
                        $scope.model.target.udi = media.udi;
                        $scope.model.target.isMedia = true;
                        $scope.model.target.name = media.name;
                        $scope.model.target.url = media.image;
                        $scope.mediaPickerOverlay.show = false;
                        $scope.mediaPickerOverlay = null;
                        // make sure the content tree has nothing highlighted
                        $scope.dialogTreeEventHandler.syncTree({
                            path: '-1',
                            tree: 'content'
                        });
                    }
                };
            });
        };
        $scope.hideSearch = function () {
            $scope.searchInfo.showSearch = false;
            $scope.searchInfo.searchFromId = null;
            $scope.searchInfo.searchFromName = null;
            $scope.searchInfo.results = [];
        };
        // method to select a search result
        $scope.selectResult = function (evt, result) {
            result.selected = result.selected === true ? false : true;
            nodeSelectHandler(evt, {
                event: evt,
                node: result
            });
        };
        //callback when there are search results
        $scope.onSearchResults = function (results) {
            $scope.searchInfo.results = results;
            $scope.searchInfo.showSearch = true;
        };
        $scope.dialogTreeEventHandler.bind('treeNodeSelect', nodeSelectHandler);
        $scope.dialogTreeEventHandler.bind('treeNodeExpanded', nodeExpandedHandler);
        $scope.$on('$destroy', function () {
            $scope.dialogTreeEventHandler.unbind('treeNodeSelect', nodeSelectHandler);
            $scope.dialogTreeEventHandler.unbind('treeNodeExpanded', nodeExpandedHandler);
        });
        // Mini list view
        $scope.selectListViewNode = function (node) {
            node.selected = node.selected === true ? false : true;
            nodeSelectHandler({}, { node: node });
        };
        $scope.closeMiniListView = function () {
            $scope.miniListView = undefined;
        };
        function openMiniListView(node) {
            $scope.miniListView = node;
        }
    });
    function MacroPickerController($scope, entityResource, macroResource, umbPropEditorHelper, macroService, formHelper, localizationService) {
        if (!$scope.model.title) {
            $scope.model.title = localizationService.localize('defaultdialogs_selectMacro');
        }
        $scope.macros = [];
        $scope.model.selectedMacro = null;
        $scope.model.macroParams = [];
        $scope.wizardStep = 'macroSelect';
        $scope.noMacroParams = false;
        $scope.selectMacro = function (macro) {
            $scope.model.selectedMacro = macro;
            if ($scope.wizardStep === 'macroSelect') {
                editParams(true);
            } else {
                $scope.model.submit($scope.model);
            }
        };
        /** changes the view to edit the params of the selected macro */
        /** if there is pnly one macro, and it has parameters - editor can skip selecting the Macro **/
        function editParams(insertIfNoParameters) {
            //whether to insert the macro in the rich text editor when editParams is called and there are no parameters see U4-10537 
            insertIfNoParameters = typeof insertIfNoParameters !== 'undefined' ? insertIfNoParameters : true;
            //get the macro params if there are any
            macroResource.getMacroParameters($scope.model.selectedMacro.id).then(function (data) {
                //go to next page if there are params otherwise we can just exit
                if (!angular.isArray(data) || data.length === 0) {
                    if (insertIfNoParameters) {
                        $scope.model.submit($scope.model);
                    } else {
                        $scope.wizardStep = 'macroSelect';
                    }
                } else {
                    $scope.wizardStep = 'paramSelect';
                    $scope.model.macroParams = data;
                    //fill in the data if we are editing this macro
                    if ($scope.model.dialogData && $scope.model.dialogData.macroData && $scope.model.dialogData.macroData.macroParamsDictionary) {
                        _.each($scope.model.dialogData.macroData.macroParamsDictionary, function (val, key) {
                            var prop = _.find($scope.model.macroParams, function (item) {
                                return item.alias == key;
                            });
                            if (prop) {
                                if (_.isString(val)) {
                                    //we need to unescape values as they have most likely been escaped while inserted
                                    val = _.unescape(val);
                                    //detect if it is a json string
                                    if (val.detectIsJson()) {
                                        try {
                                            //Parse it to json
                                            prop.value = angular.fromJson(val);
                                        } catch (e) {
                                            // not json
                                            prop.value = val;
                                        }
                                    } else {
                                        prop.value = val;
                                    }
                                } else {
                                    prop.value = val;
                                }
                            }
                        });
                    }
                }
            });
        }
        //here we check to see if we've been passed a selected macro and if so we'll set the
        //editor to start with parameter editing
        if ($scope.model.dialogData && $scope.model.dialogData.macroData) {
            $scope.wizardStep = 'paramSelect';
        }
        //get the macro list - pass in a filter if it is only for rte
        entityResource.getAll('Macro', $scope.model.dialogData && $scope.model.dialogData.richTextEditor && $scope.model.dialogData.richTextEditor === true ? 'UseInEditor=true' : null).then(function (data) {
            if (angular.isArray(data) && data.length == 0) {
                $scope.nomacros = true;
            }
            //if 'allowedMacros' is specified, we need to filter
            if (angular.isArray($scope.model.dialogData.allowedMacros) && $scope.model.dialogData.allowedMacros.length > 0) {
                $scope.macros = _.filter(data, function (d) {
                    return _.contains($scope.model.dialogData.allowedMacros, d.alias);
                });
            } else {
                $scope.macros = data;
            }
            //check if there's a pre-selected macro and if it exists
            if ($scope.model.dialogData && $scope.model.dialogData.macroData && $scope.model.dialogData.macroData.macroAlias) {
                var found = _.find(data, function (item) {
                    return item.alias === $scope.model.dialogData.macroData.macroAlias;
                });
                if (found) {
                    //select the macro and go to next screen
                    $scope.model.selectedMacro = found;
                    editParams(true);
                    return;
                }
            }
            //if there is only one macro in the site and it has parameters, let's not make the editor choose it from a selection of one macro (unless there are no parameters - then weirdly it's a better experience to make that selection)
            if ($scope.macros.length == 1) {
                $scope.model.selectedMacro = $scope.macros[0];
                editParams(false);
            } else {
                //we don't have a pre-selected macro so ensure the correct step is set
                $scope.wizardStep = 'macroSelect';
            }
        });
    }
    angular.module('umbraco').controller('Umbraco.Overlays.MacroPickerController', MacroPickerController);
    //used for the media picker dialog
    angular.module('umbraco').controller('Umbraco.Overlays.MediaPickerController', function ($scope, mediaResource, umbRequestHelper, entityResource, $log, mediaHelper, mediaTypeHelper, eventsService, treeService, $element, $timeout, userService, $cookies, localStorageService, localizationService) {
        if (!$scope.model.title) {
            $scope.model.title = localizationService.localize('defaultdialogs_selectMedia');
        }
        var dialogOptions = $scope.model;
        $scope.disableFolderSelect = dialogOptions.disableFolderSelect;
        $scope.onlyImages = dialogOptions.onlyImages;
        $scope.showDetails = dialogOptions.showDetails;
        $scope.multiPicker = dialogOptions.multiPicker && dialogOptions.multiPicker !== '0' ? true : false;
        $scope.startNodeId = dialogOptions.startNodeId ? dialogOptions.startNodeId : -1;
        $scope.cropSize = dialogOptions.cropSize;
        $scope.lastOpenedNode = localStorageService.get('umbLastOpenedMediaNodeId');
        $scope.lockedFolder = true;
        var userStartNodes = [];
        var umbracoSettings = Umbraco.Sys.ServerVariables.umbracoSettings;
        var allowedUploadFiles = mediaHelper.formatFileTypes(umbracoSettings.allowedUploadFiles);
        if ($scope.onlyImages) {
            $scope.acceptedFileTypes = mediaHelper.formatFileTypes(umbracoSettings.imageFileTypes);
        } else {
            // Use whitelist of allowed file types if provided
            if (allowedUploadFiles !== '') {
                $scope.acceptedFileTypes = allowedUploadFiles;
            } else {
                // If no whitelist, we pass in a blacklist by adding ! to the file extensions, allowing everything EXCEPT for disallowedUploadFiles
                $scope.acceptedFileTypes = !mediaHelper.formatFileTypes(umbracoSettings.disallowedUploadFiles);
            }
        }
        $scope.maxFileSize = umbracoSettings.maxFileSize + 'KB';
        $scope.model.selectedImages = [];
        $scope.acceptedMediatypes = [];
        mediaTypeHelper.getAllowedImagetypes($scope.startNodeId).then(function (types) {
            $scope.acceptedMediatypes = types;
        });
        var dataTypeId = null;
        if ($scope.model && $scope.model.dataTypeId) {
            dataTypeId = $scope.model.dataTypeId;
        }
        $scope.searchOptions = {
            pageNumber: 1,
            pageSize: 100,
            totalItems: 0,
            totalPages: 0,
            filter: '',
            dataTypeId: dataTypeId
        };
        //preload selected item
        $scope.target = undefined;
        if (dialogOptions.currentTarget) {
            $scope.target = dialogOptions.currentTarget;
        }
        function onInit() {
            userService.getCurrentUser().then(function (userData) {
                userStartNodes = userData.startMediaIds;
                if ($scope.startNodeId !== -1) {
                    entityResource.getById($scope.startNodeId, 'media').then(function (ent) {
                        $scope.startNodeId = ent.id;
                        run();
                    });
                } else {
                    run();
                }
            });
        }
        function run() {
            //default root item
            if (!$scope.target) {
                if ($scope.lastOpenedNode && $scope.lastOpenedNode !== -1) {
                    entityResource.getById($scope.lastOpenedNode, 'media').then(ensureWithinStartNode, gotoStartNode);
                } else {
                    gotoStartNode();
                }
            } else {
                //if a target is specified, go look it up - generally this target will just contain ids not the actual full
                //media object so we need to look it up
                var id = $scope.target.udi ? $scope.target.udi : $scope.target.id;
                var altText = $scope.target.altText;
                if (id) {
                    entityResource.getById(id, 'Media').then(function (node) {
                        $scope.target = node;
                        if (ensureWithinStartNode(node)) {
                            selectImage(node);
                            $scope.target.url = mediaHelper.resolveFile(node);
                            $scope.target.altText = altText;
                            $scope.openDetailsDialog();
                        }
                    }, gotoStartNode);
                } else {
                    gotoStartNode();
                }
            }
        }
        $scope.upload = function (v) {
            angular.element('.umb-file-dropzone-directive .file-select').click();
        };
        $scope.dragLeave = function (el, event) {
            $scope.activeDrag = false;
        };
        $scope.dragEnter = function (el, event) {
            $scope.activeDrag = true;
        };
        $scope.submitFolder = function () {
            if ($scope.newFolderName) {
                $scope.creatingFolder = true;
                mediaResource.addFolder($scope.newFolderName, $scope.currentFolder.id).then(function (data) {
                    //we've added a new folder so lets clear the tree cache for that specific item
                    treeService.clearCache({
                        cacheKey: '__media',
                        //this is the main media tree cache key
                        childrenOf: data.parentId
                    });
                    $scope.creatingFolder = false;
                    $scope.gotoFolder(data);
                    $scope.showFolderInput = false;
                    $scope.newFolderName = '';
                });
            } else {
                $scope.showFolderInput = false;
            }
        };
        $scope.enterSubmitFolder = function (event) {
            if (event.keyCode === 13) {
                $scope.submitFolder();
                event.stopPropagation();
            }
        };
        $scope.gotoFolder = function (folder) {
            if (!$scope.multiPicker) {
                deselectAllImages($scope.model.selectedImages);
            }
            if (!folder) {
                folder = {
                    id: -1,
                    name: 'Media',
                    icon: 'icon-folder'
                };
            }
            if (folder.id > 0) {
                entityResource.getAncestors(folder.id, 'media', { dataTypeId: dataTypeId }).then(function (anc) {
                    $scope.path = _.filter(anc, function (f) {
                        return f.path.indexOf($scope.startNodeId) !== -1;
                    });
                });
            } else {
                $scope.path = [];
            }
            mediaTypeHelper.getAllowedImagetypes(folder.id).then(function (types) {
                $scope.acceptedMediatypes = types;
            });
            $scope.lockedFolder = folder.id === -1 && $scope.model.startNodeIsVirtual || hasFolderAccess(folder) === false;
            $scope.currentFolder = folder;
            localStorageService.set('umbLastOpenedMediaNodeId', folder.id);
            return getChildren(folder.id);
        };
        $scope.clickHandler = function (image, event, index) {
            if (image.isFolder) {
                if ($scope.disableFolderSelect) {
                    $scope.gotoFolder(image);
                } else {
                    eventsService.emit('dialogs.mediaPicker.select', image);
                    selectImage(image);
                }
            } else {
                eventsService.emit('dialogs.mediaPicker.select', image);
                if ($scope.showDetails) {
                    $scope.target = image;
                    // handle both entity and full media object
                    if (image.image) {
                        $scope.target.url = image.image;
                    } else {
                        $scope.target.url = mediaHelper.resolveFile(image);
                    }
                    $scope.openDetailsDialog();
                } else {
                    selectImage(image);
                }
            }
        };
        $scope.clickItemName = function (item) {
            if (item.isFolder) {
                $scope.gotoFolder(item);
            }
        };
        function selectImage(image) {
            if (image.selected) {
                for (var i = 0; $scope.model.selectedImages.length > i; i++) {
                    var imageInSelection = $scope.model.selectedImages[i];
                    if (image.key === imageInSelection.key) {
                        image.selected = false;
                        $scope.model.selectedImages.splice(i, 1);
                    }
                }
            } else {
                if (!$scope.multiPicker) {
                    deselectAllImages($scope.model.selectedImages);
                }
                image.selected = true;
                $scope.model.selectedImages.push(image);
            }
        }
        function deselectAllImages(images) {
            for (var i = 0; i < images.length; i++) {
                var image = images[i];
                image.selected = false;
            }
            images.length = 0;
        }
        $scope.onUploadComplete = function (files) {
            $scope.gotoFolder($scope.currentFolder).then(function () {
                if (files.length === 1 && $scope.model.selectedImages.length === 0) {
                    var image = $scope.images[$scope.images.length - 1];
                    $scope.target = image;
                    $scope.target.url = mediaHelper.resolveFile(image);
                    selectImage(image);
                }
            });
        };
        $scope.onFilesQueue = function () {
            $scope.activeDrag = false;
        };
        function ensureWithinStartNode(node) {
            // make sure that last opened node is on the same path as start node
            var nodePath = node.path.split(',');
            // also make sure the node is not trashed
            if (nodePath.indexOf($scope.startNodeId.toString()) !== -1 && node.trashed === false) {
                $scope.gotoFolder({
                    id: $scope.lastOpenedNode,
                    name: 'Media',
                    icon: 'icon-folder',
                    path: node.path
                });
                return true;
            } else {
                $scope.gotoFolder({
                    id: $scope.startNodeId,
                    name: 'Media',
                    icon: 'icon-folder'
                });
                return false;
            }
        }
        function hasFolderAccess(node) {
            var nodePath = node.path ? node.path.split(',') : [node.id];
            for (var i = 0; i < nodePath.length; i++) {
                if (userStartNodes.indexOf(parseInt(nodePath[i])) !== -1)
                    return true;
            }
            return false;
        }
        function gotoStartNode(err) {
            $scope.gotoFolder({
                id: $scope.startNodeId,
                name: 'Media',
                icon: 'icon-folder'
            });
        }
        $scope.openDetailsDialog = function () {
            $scope.mediaPickerDetailsOverlay = {};
            $scope.mediaPickerDetailsOverlay.show = true;
            $scope.mediaPickerDetailsOverlay.submit = function (model) {
                $scope.model.selectedImages.push($scope.target);
                $scope.model.submit($scope.model);
                $scope.mediaPickerDetailsOverlay.show = false;
                $scope.mediaPickerDetailsOverlay = null;
            };
            $scope.mediaPickerDetailsOverlay.close = function (oldModel) {
                $scope.mediaPickerDetailsOverlay.show = false;
                $scope.mediaPickerDetailsOverlay = null;
            };
        };
        var debounceSearchMedia = _.debounce(function () {
            $scope.$apply(function () {
                if ($scope.searchOptions.filter) {
                    searchMedia();
                } else {
                    // reset pagination
                    $scope.searchOptions = {
                        pageNumber: 1,
                        pageSize: 100,
                        totalItems: 0,
                        totalPages: 0,
                        filter: '',
                        dataTypeId: dataTypeId
                    };
                    getChildren($scope.currentFolder.id);
                }
            });
        }, 500);
        $scope.changeSearch = function () {
            $scope.loading = true;
            debounceSearchMedia();
        };
        $scope.toggle = function () {
            // Make sure to activate the changeSearch function everytime the toggle is clicked
            $scope.changeSearch();
        };
        $scope.changePagination = function (pageNumber) {
            $scope.loading = true;
            $scope.searchOptions.pageNumber = pageNumber;
            searchMedia();
        };
        function searchMedia() {
            $scope.loading = true;
            entityResource.getPagedDescendants($scope.currentFolder.id, 'Media', $scope.searchOptions).then(function (data) {
                // update image data to work with image grid
                angular.forEach(data.items, function (mediaItem) {
                    // set thumbnail and src
                    mediaItem.thumbnail = mediaHelper.resolveFileFromEntity(mediaItem, true);
                    mediaItem.image = mediaHelper.resolveFileFromEntity(mediaItem, false);
                    // set properties to match a media object
                    mediaItem.properties = [];
                    if (mediaItem.metaData) {
                        if (mediaItem.metaData.umbracoWidth && mediaItem.metaData.umbracoHeight) {
                            mediaItem.properties.push({
                                alias: 'umbracoWidth',
                                value: mediaItem.metaData.umbracoWidth.Value
                            });
                            mediaItem.properties.push({
                                alias: 'umbracoHeight',
                                value: mediaItem.metaData.umbracoHeight.Value
                            });
                        }
                        if (mediaItem.metaData.umbracoFile) {
                            mediaItem.properties.push({
                                alias: 'umbracoFile',
                                editor: mediaItem.metaData.umbracoFile.PropertyEditorAlias,
                                value: mediaItem.metaData.umbracoFile.Value
                            });
                        }
                    }
                });
                // update images
                $scope.images = data.items ? data.items : [];
                // update pagination
                if (data.pageNumber > 0)
                    $scope.searchOptions.pageNumber = data.pageNumber;
                if (data.pageSize > 0)
                    $scope.searchOptions.pageSize = data.pageSize;
                $scope.searchOptions.totalItems = data.totalItems;
                $scope.searchOptions.totalPages = data.totalPages;
                // set already selected images to selected
                preSelectImages();
                $scope.loading = false;
            });
        }
        function getChildren(id) {
            $scope.loading = true;
            return entityResource.getChildren(id, 'Media', $scope.searchOptions).then(function (data) {
                for (var i = 0; i < data.length; i++) {
                    if (data[i].metaData.MediaPath !== null) {
                        data[i].thumbnail = mediaHelper.resolveFileFromEntity(data[i], true);
                        data[i].image = mediaHelper.resolveFileFromEntity(data[i], false);
                    }
                }
                $scope.searchOptions.filter = '';
                $scope.images = data ? data : [];
                // set already selected images to selected
                preSelectImages();
                $scope.loading = false;
            });
        }
        function preSelectImages() {
            for (var folderImageIndex = 0; folderImageIndex < $scope.images.length; folderImageIndex++) {
                var folderImage = $scope.images[folderImageIndex];
                var imageIsSelected = false;
                if ($scope.model && angular.isArray($scope.model.selectedImages)) {
                    for (var selectedImageIndex = 0; selectedImageIndex < $scope.model.selectedImages.length; selectedImageIndex++) {
                        var selectedImage = $scope.model.selectedImages[selectedImageIndex];
                        if (folderImage.key === selectedImage.key) {
                            imageIsSelected = true;
                        }
                    }
                }
                if (imageIsSelected) {
                    folderImage.selected = true;
                }
            }
        }
        onInit();
    });
    angular.module('umbraco').controller('Umbraco.Overlays.MediaTypePickerController', function ($scope) {
        $scope.select = function (mediatype) {
            $scope.model.selectedType = mediatype;
            $scope.model.submit($scope.model);
            $scope.model.show = false;
        };
    });
    //used for the member picker dialog
    angular.module('umbraco').controller('Umbraco.Overlays.MemberGroupPickerController', function ($scope, eventsService, entityResource, searchService, $log, localizationService) {
        if (!$scope.model.title) {
            $scope.model.title = localizationService.localize('defaultdialogs_selectMemberGroup');
        }
        $scope.dialogTreeEventHandler = $({});
        $scope.multiPicker = $scope.model.multiPicker;
        function activate() {
            if ($scope.multiPicker) {
                $scope.model.selectedMemberGroups = [];
            } else {
                $scope.model.selectedMemberGroup = '';
            }
        }
        function selectMemberGroup(id) {
            $scope.model.selectedMemberGroup = id;
        }
        function selectMemberGroups(id) {
            var index = $scope.model.selectedMemberGroups.indexOf(id);
            if (index === -1) {
                // If the id does not exists in the array then add it
                $scope.model.selectedMemberGroups.push(id);
            } else {
                // Otherwise we will remove it from the array instead
                $scope.model.selectedMemberGroups.splice(index, 1);
            }
        }
        /** Method used for selecting a node */
        function select(text, id) {
            if ($scope.model.multiPicker) {
                selectMemberGroups(id);
            } else {
                selectMemberGroup(id);
                $scope.model.submit($scope.model);
            }
        }
        function nodeSelectHandler(ev, args) {
            args.event.preventDefault();
            args.event.stopPropagation();
            eventsService.emit('dialogs.memberGroupPicker.select', args);
            //This is a tree node, so we don't have an entity to pass in, it will need to be looked up
            //from the server in this method.
            select(args.node.name, args.node.id);
            //toggle checked state
            args.node.selected = args.node.selected === true ? false : true;
        }
        $scope.dialogTreeEventHandler.bind('treeNodeSelect', nodeSelectHandler);
        $scope.$on('$destroy', function () {
            $scope.dialogTreeEventHandler.unbind('treeNodeSelect', nodeSelectHandler);
        });
        activate();
    });
    (function () {
        'use strict';
        function MoveOverlay($scope, localizationService, eventsService, entityHelper) {
            var vm = this;
            vm.hideSearch = hideSearch;
            vm.selectResult = selectResult;
            vm.onSearchResults = onSearchResults;
            var dialogOptions = $scope.model;
            var searchText = 'Search...';
            var node = dialogOptions.currentNode;
            localizationService.localize('general_search').then(function (value) {
                searchText = value + '...';
            });
            if (!$scope.model.title) {
                $scope.model.title = localizationService.localize('actions_move');
            }
            $scope.model.relateToOriginal = true;
            $scope.dialogTreeEventHandler = $({});
            vm.searchInfo = {
                searchFromId: null,
                searchFromName: null,
                showSearch: false,
                results: [],
                selectedSearchResults: []
            };
            // get entity type based on the section
            $scope.entityType = entityHelper.getEntityTypeFromSection(dialogOptions.section);
            function nodeSelectHandler(ev, args) {
                if (args && args.event) {
                    args.event.preventDefault();
                    args.event.stopPropagation();
                }
                //eventsService.emit("editors.content.copyController.select", args);
                if ($scope.model.target) {
                    //un-select if there's a current one selected
                    $scope.model.target.selected = false;
                }
                $scope.model.target = args.node;
                $scope.model.target.selected = true;
            }
            function nodeExpandedHandler(ev, args) {
                // open mini list view for list views
                if (args.node.metaData.isContainer) {
                    openMiniListView(args.node);
                }
            }
            function hideSearch() {
                vm.searchInfo.showSearch = false;
                vm.searchInfo.searchFromId = null;
                vm.searchInfo.searchFromName = null;
                vm.searchInfo.results = [];
            }
            // method to select a search result
            function selectResult(evt, result) {
                result.selected = result.selected === true ? false : true;
                nodeSelectHandler(evt, {
                    event: evt,
                    node: result
                });
            }
            //callback when there are search results
            function onSearchResults(results) {
                vm.searchInfo.results = results;
                vm.searchInfo.showSearch = true;
            }
            $scope.dialogTreeEventHandler.bind('treeNodeSelect', nodeSelectHandler);
            $scope.dialogTreeEventHandler.bind('treeNodeExpanded', nodeExpandedHandler);
            $scope.$on('$destroy', function () {
                $scope.dialogTreeEventHandler.unbind('treeNodeSelect', nodeSelectHandler);
                $scope.dialogTreeEventHandler.unbind('treeNodeExpanded', nodeExpandedHandler);
            });
            // Mini list view
            $scope.selectListViewNode = function (node) {
                node.selected = node.selected === true ? false : true;
                nodeSelectHandler({}, { node: node });
            };
            $scope.closeMiniListView = function () {
                $scope.miniListView = undefined;
            };
            function openMiniListView(node) {
                $scope.miniListView = node;
            }
        }
        angular.module('umbraco').controller('Umbraco.Overlays.MoveOverlay', MoveOverlay);
    }());
    (function () {
        'use strict';
        function NodePermissionsController($scope, localizationService) {
            var vm = this;
            function onInit() {
                // set default title
                if (!$scope.model.title) {
                    localizationService.localize('defaultdialogs_permissionsEdit').then(function (value) {
                        $scope.model.title = value + ' ' + $scope.model.node.name;
                    });
                }
            }
            onInit();
        }
        angular.module('umbraco').controller('Umbraco.Overlays.NodePermissionsController', NodePermissionsController);
    }());
    (function () {
        'use strict';
        function QueryBuilderOverlayController($scope, templateQueryResource, localizationService) {
            var everything = '';
            var myWebsite = '';
            var ascendingTranslation = '';
            var descendingTranslation = '';
            var vm = this;
            vm.properties = [];
            vm.contentTypes = [];
            vm.conditions = [];
            vm.datePickerConfig = {
                pickDate: true,
                pickTime: false,
                format: 'YYYY-MM-DD'
            };
            vm.chooseSource = chooseSource;
            vm.getPropertyOperators = getPropertyOperators;
            vm.addFilter = addFilter;
            vm.trashFilter = trashFilter;
            vm.changeSortOrder = changeSortOrder;
            vm.setSortProperty = setSortProperty;
            vm.setContentType = setContentType;
            vm.setFilterProperty = setFilterProperty;
            vm.setFilterTerm = setFilterTerm;
            vm.changeConstraintValue = changeConstraintValue;
            vm.datePickerChange = datePickerChange;
            function onInit() {
                vm.query = {
                    contentType: { name: everything },
                    source: { name: myWebsite },
                    filters: [{
                            property: undefined,
                            operator: undefined
                        }],
                    sort: {
                        property: {
                            alias: '',
                            name: ''
                        },
                        direction: 'ascending',
                        //This is the value for sorting sent to server
                        translation: {
                            currentLabel: ascendingTranslation,
                            //This is the localized UI value in the the dialog
                            ascending: ascendingTranslation,
                            descending: descendingTranslation
                        }
                    }
                };
                templateQueryResource.getAllowedProperties().then(function (properties) {
                    vm.properties = properties;
                });
                templateQueryResource.getContentTypes().then(function (contentTypes) {
                    vm.contentTypes = contentTypes;
                });
                templateQueryResource.getFilterConditions().then(function (conditions) {
                    vm.conditions = conditions;
                });
                throttledFunc();
            }
            function chooseSource(query) {
                vm.contentPickerOverlay = {
                    view: 'contentpicker',
                    show: true,
                    submit: function (model) {
                        var selectedNodeId = model.selection[0].id;
                        var selectedNodeName = model.selection[0].name;
                        if (selectedNodeId > 0) {
                            query.source = {
                                id: selectedNodeId,
                                name: selectedNodeName
                            };
                        } else {
                            query.source.name = myWebsite;
                            delete query.source.id;
                        }
                        throttledFunc();
                        vm.contentPickerOverlay.show = false;
                        vm.contentPickerOverlay = null;
                    },
                    close: function (oldModel) {
                        vm.contentPickerOverlay.show = false;
                        vm.contentPickerOverlay = null;
                    }
                };
            }
            function getPropertyOperators(property) {
                var conditions = _.filter(vm.conditions, function (condition) {
                    var index = condition.appliesTo.indexOf(property.type);
                    return index >= 0;
                });
                return conditions;
            }
            function addFilter(query) {
                query.filters.push({});
            }
            function trashFilter(query, filter) {
                for (var i = 0; i < query.filters.length; i++) {
                    if (query.filters[i] == filter) {
                        query.filters.splice(i, 1);
                    }
                }
                //if we remove the last one, add a new one to generate ui for it.
                if (query.filters.length == 0) {
                    query.filters.push({});
                }
            }
            function changeSortOrder(query) {
                if (query.sort.direction === 'ascending') {
                    query.sort.direction = 'descending';
                    query.sort.translation.currentLabel = query.sort.translation.descending;
                } else {
                    query.sort.direction = 'ascending';
                    query.sort.translation.currentLabel = query.sort.translation.ascending;
                }
                throttledFunc();
            }
            function setSortProperty(query, property) {
                query.sort.property = property;
                if (property.type === 'datetime') {
                    query.sort.direction = 'descending';
                    query.sort.translation.currentLabel = query.sort.translation.descending;
                } else {
                    query.sort.direction = 'ascending';
                    query.sort.translation.currentLabel = query.sort.translation.ascending;
                }
                throttledFunc();
            }
            function setContentType(contentType) {
                vm.query.contentType = contentType;
                throttledFunc();
            }
            function setFilterProperty(filter, property) {
                filter.property = property;
                filter.term = {};
                filter.constraintValue = '';
            }
            function setFilterTerm(filter, term) {
                filter.term = term;
                if (filter.constraintValue) {
                    throttledFunc();
                }
            }
            function changeConstraintValue() {
                throttledFunc();
            }
            function datePickerChange(event, filter) {
                if (event.date && event.date.isValid()) {
                    filter.constraintValue = event.date.format(vm.datePickerConfig.format);
                    throttledFunc();
                }
            }
            var throttledFunc = _.throttle(function () {
                templateQueryResource.postTemplateQuery(vm.query).then(function (response) {
                    $scope.model.result = response;
                });
            }, 200);
            localizationService.localizeMany([
                'template_allContent',
                'template_websiteRoot',
                'template_ascending',
                'template_descending'
            ]).then(function (res) {
                everything = res[0];
                myWebsite = res[1];
                ascendingTranslation = res[2];
                descendingTranslation = res[3];
                onInit();
            });
        }
        angular.module('umbraco').controller('Umbraco.Overlays.QueryBuilderController', QueryBuilderOverlayController);
    }());
    (function () {
        'use strict';
        function SectionPickerController($scope, sectionResource, localizationService) {
            var vm = this;
            vm.sections = [];
            vm.loading = false;
            vm.selectSection = selectSection;
            //////////
            function onInit() {
                vm.loading = true;
                // set default title
                if (!$scope.model.title) {
                    $scope.model.title = localizationService.localize('defaultdialogs_selectSections');
                }
                // make sure we can push to something
                if (!$scope.model.selection) {
                    $scope.model.selection = [];
                }
                // get sections
                sectionResource.getAllSections().then(function (sections) {
                    vm.sections = sections;
                    setSectionIcon(vm.sections);
                    if ($scope.model.selection && $scope.model.selection.length > 0) {
                        preSelect($scope.model.selection);
                    }
                    vm.loading = false;
                });
            }
            function preSelect(selection) {
                angular.forEach(selection, function (selected) {
                    angular.forEach(vm.sections, function (section) {
                        if (selected.alias === section.alias) {
                            section.selected = true;
                        }
                    });
                });
            }
            function selectSection(section) {
                if (!section.selected) {
                    section.selected = true;
                    $scope.model.selection.push(section);
                } else {
                    angular.forEach($scope.model.selection, function (selectedSection, index) {
                        if (selectedSection.alias === section.alias) {
                            section.selected = false;
                            $scope.model.selection.splice(index, 1);
                        }
                    });
                }
            }
            function setSectionIcon(sections) {
                angular.forEach(sections, function (section) {
                    section.icon = 'icon-section ' + section.cssclass;
                });
            }
            onInit();
        }
        angular.module('umbraco').controller('Umbraco.Overlays.SectionPickerController', SectionPickerController);
    }());
    (function () {
        'use strict';
        function TemplateSectionsOverlayController($scope) {
            var vm = this;
            $scope.model.mandatoryRenderSection = false;
            if (!$scope.model.title) {
                $scope.model.title = 'Sections';
            }
            vm.select = select;
            function onInit() {
                if ($scope.model.hasMaster) {
                    $scope.model.insertType = 'addSection';
                } else {
                    $scope.model.insertType = 'renderBody';
                }
            }
            function select(type) {
                $scope.model.insertType = type;
            }
            onInit();
        }
        angular.module('umbraco').controller('Umbraco.Overlays.TemplateSectionsOverlay', TemplateSectionsOverlayController);
    }());
    //used for the media picker dialog
    angular.module('umbraco').controller('Umbraco.Overlays.TreePickerController', function ($scope, $q, entityResource, eventsService, $log, searchService, angularHelper, $timeout, localizationService, treeService, contentResource, mediaResource, memberResource) {
        var tree = null;
        var dialogOptions = $scope.model;
        $scope.treeReady = false;
        $scope.dialogTreeEventHandler = $({});
        $scope.section = dialogOptions.section;
        $scope.treeAlias = dialogOptions.treeAlias;
        $scope.multiPicker = dialogOptions.multiPicker;
        $scope.hideHeader = typeof dialogOptions.hideHeader === 'boolean' ? dialogOptions.hideHeader : true;
        // if you need to load a not initialized tree set this value to false - default is true
        $scope.onlyInitialized = dialogOptions.onlyInitialized;
        $scope.searchInfo = {
            searchFromId: dialogOptions.startNodeId,
            searchFromName: null,
            showSearch: false,
            dataTypeId: dialogOptions && dialogOptions.dataTypeId ? dialogOptions.dataTypeId : null,
            results: [],
            selectedSearchResults: []
        };
        $scope.model.selection = [];
        //Used for toggling an empty-state message
        //Some trees can have no items (dictionary & forms email templates)
        $scope.hasItems = true;
        $scope.emptyStateMessage = dialogOptions.emptyStateMessage;
        var node = dialogOptions.currentNode;
        //This is called from ng-init
        //it turns out it is called from the angular html : / Have a look at views/common / overlays / contentpicker / contentpicker.html you'll see ng-init.
        //this is probably an anti pattern IMO and shouldn't be used
        $scope.init = function (contentType) {
            if (contentType === 'content') {
                $scope.entityType = 'Document';
                if (!$scope.model.title) {
                    $scope.model.title = localizationService.localize('defaultdialogs_selectContent');
                }
            } else if (contentType === 'member') {
                $scope.entityType = 'Member';
                if (!$scope.model.title) {
                    $scope.model.title = localizationService.localize('defaultdialogs_selectMember');
                }
            } else if (contentType === 'media') {
                $scope.entityType = 'Media';
                if (!$scope.model.title) {
                    $scope.model.title = localizationService.localize('defaultdialogs_selectMedia');
                }
            }
        };
        var searchText = 'Search...';
        localizationService.localize('general_search').then(function (value) {
            searchText = value + '...';
        });
        // Allow the entity type to be passed in but defaults to Document for backwards compatibility.
        $scope.entityType = dialogOptions.entityType ? dialogOptions.entityType : 'Document';
        //min / max values
        if (dialogOptions.minNumber) {
            dialogOptions.minNumber = parseInt(dialogOptions.minNumber, 10);
        }
        if (dialogOptions.maxNumber) {
            dialogOptions.maxNumber = parseInt(dialogOptions.maxNumber, 10);
        }
        if (dialogOptions.section === 'member') {
            $scope.entityType = 'Member';
        } else if (dialogOptions.section === 'media') {
            $scope.entityType = 'Media';
        }
        // Search and listviews is only working for content, media and member section
        var searchableSections = [
            'content',
            'media',
            'member'
        ];
        $scope.enableSearh = searchableSections.indexOf($scope.section) !== -1;
        //if a alternative startnode is used, we need to check if it is a container
        if ($scope.enableSearh && dialogOptions.startNodeId && dialogOptions.startNodeId !== -1 && dialogOptions.startNodeId !== '-1') {
            entityResource.getById(dialogOptions.startNodeId, $scope.entityType).then(function (node) {
                if (node.metaData.IsContainer) {
                    openMiniListView(node);
                }
                initTree();
            });
        } else {
            initTree();
        }
        //Configures filtering
        if (dialogOptions.filter) {
            dialogOptions.filterExclude = false;
            dialogOptions.filterAdvanced = false;
            //used advanced filtering
            if (angular.isFunction(dialogOptions.filter)) {
                dialogOptions.filterAdvanced = true;
            } else if (angular.isObject(dialogOptions.filter)) {
                dialogOptions.filterAdvanced = true;
            } else {
                if (dialogOptions.filter.startsWith('!')) {
                    dialogOptions.filterExclude = true;
                    dialogOptions.filterTypes = dialogOptions.filter.substring(1);
                } else {
                    dialogOptions.filterExclude = false;
                    dialogOptions.filterTypes = dialogOptions.filter;
                }
                //used advanced filtering
                if (dialogOptions.filter.startsWith('{')) {
                    dialogOptions.filterAdvanced = true;
                    //convert to object
                    dialogOptions.filter = angular.fromJson(dialogOptions.filter);
                }
            }
            $scope.filter = {
                filterAdvanced: dialogOptions.filterAdvanced,
                filterExclude: dialogOptions.filterExclude,
                filter: dialogOptions.filterTypes
            };
        }
        function initTree() {
            //create the custom query string param for this tree
            var params = [];
            if (dialogOptions.startNodeId)
                params.push('startNodeId=' + dialogOptions.startNodeId);
            if (dialogOptions.dataTypeId)
                params.push('dataTypeId=' + dialogOptions.dataTypeId);
            if (dialogOptions.customTreeParams)
                params.push(dialogOptions.customTreeParams);
            $scope.customTreeParams = params.join('&');
            $scope.treeReady = true;
        }
        function nodeExpandedHandler(ev, args) {
            // open mini list view for list views
            if (args.node.metaData.isContainer) {
                openMiniListView(args.node);
            }
            if (angular.isArray(args.children)) {
                //iterate children
                _.each(args.children, function (child) {
                    //now we need to look in the already selected search results and
                    // toggle the check boxes for those ones that are listed
                    var exists = _.find($scope.searchInfo.selectedSearchResults, function (selected) {
                        return child.id == selected.id;
                    });
                    if (exists) {
                        child.selected = true;
                    }
                });
                //check filter
                performFiltering(args.children);
            }
        }
        //gets the tree object when it loads
        function treeLoadedHandler(ev, args) {
            //args.tree contains children (args.tree.root.children)
            $scope.hasItems = args.tree.root.children.length > 0;
            tree = args.tree;
            var nodeHasPath = typeof node !== 'undefined' && typeof node.path !== 'undefined';
            var startNodeNotDefined = typeof dialogOptions.startNodeId === 'undefined' || dialogOptions.startNodeId === '' || dialogOptions.startNodeId === '-1';
            if (startNodeNotDefined && nodeHasPath) {
                $scope.dialogTreeEventHandler.syncTree({
                    path: node.path,
                    activate: false
                });
            }
        }
        //wires up selection
        function nodeSelectHandler(ev, args) {
            args.event.preventDefault();
            args.event.stopPropagation();
            if (args.node.metaData.isSearchResult) {
                //check if the item selected was a search result from a list view
                //unselect
                select(args.node.name, args.node.id);
                //remove it from the list view children
                var listView = args.node.parent();
                listView.children = _.reject(listView.children, function (child) {
                    return child.id == args.node.id;
                });
                //remove it from the custom tracked search result list
                $scope.searchInfo.selectedSearchResults = _.reject($scope.searchInfo.selectedSearchResults, function (i) {
                    return i.id == args.node.id;
                });
            } else {
                eventsService.emit('dialogs.treePickerController.select', args);
                if (args.node.filtered) {
                    return;
                }
                //This is a tree node, so we don't have an entity to pass in, it will need to be looked up
                //from the server in this method.
                if ($scope.model.select) {
                    $scope.model.select(args.node);
                } else {
                    select(args.node.name, args.node.id);
                    //toggle checked state
                    args.node.selected = args.node.selected === true ? false : true;
                }
            }
        }
        /** Method used for selecting a node */
        function select(text, id, entity) {
            //if we get the root, we just return a constructed entity, no need for server data
            if (id < 0) {
                var rootNode = {
                    alias: null,
                    icon: 'icon-folder',
                    id: id,
                    name: text
                };
                if ($scope.multiPicker) {
                    if (entity) {
                        multiSelectItem(entity);
                    } else {
                        multiSelectItem(rootNode);
                    }
                } else {
                    $scope.model.selection.push(rootNode);
                    $scope.model.submit($scope.model);
                }
            } else {
                if ($scope.multiPicker) {
                    if (entity) {
                        multiSelectItem(entity);
                    } else {
                        //otherwise we have to get it from the server
                        entityResource.getById(id, $scope.entityType).then(function (ent) {
                            multiSelectItem(ent);
                        });
                    }
                } else {
                    $scope.hideSearch();
                    //if an entity has been passed in, use it
                    if (entity) {
                        $scope.model.selection.push(entity);
                        $scope.model.submit($scope.model);
                    } else {
                        //otherwise we have to get it from the server
                        entityResource.getById(id, $scope.entityType).then(function (ent) {
                            $scope.model.selection.push(ent);
                            $scope.model.submit($scope.model);
                        });
                    }
                }
            }
        }
        function multiSelectItem(item) {
            var found = false;
            var foundIndex = 0;
            if ($scope.model.selection.length > 0) {
                for (i = 0; $scope.model.selection.length > i; i++) {
                    var selectedItem = $scope.model.selection[i];
                    if (selectedItem.id === item.id) {
                        found = true;
                        foundIndex = i;
                    }
                }
            }
            if (found) {
                $scope.model.selection.splice(foundIndex, 1);
            } else {
                $scope.model.selection.push(item);
            }
        }
        function performFiltering(nodes) {
            if (!dialogOptions.filter) {
                return;
            }
            //remove any list view search nodes from being filtered since these are special nodes that always must
            // be allowed to be clicked on
            nodes = _.filter(nodes, function (n) {
                return !angular.isObject(n.metaData.listViewNode);
            });
            if (dialogOptions.filterAdvanced) {
                //filter either based on a method or an object
                var filtered = angular.isFunction(dialogOptions.filter) ? _.filter(nodes, dialogOptions.filter) : _.where(nodes, dialogOptions.filter);
                angular.forEach(filtered, function (value, key) {
                    value.filtered = true;
                    if (dialogOptions.filterCssClass) {
                        if (!value.cssClasses) {
                            value.cssClasses = [];
                        }
                        value.cssClasses.push(dialogOptions.filterCssClass);
                    }
                });
            } else {
                var a = dialogOptions.filterTypes.toLowerCase().replace(/\s/g, '').split(',');
                angular.forEach(nodes, function (value, key) {
                    var found = a.indexOf(value.metaData.contentType.toLowerCase()) >= 0;
                    if (!dialogOptions.filterExclude && !found || dialogOptions.filterExclude && found) {
                        value.filtered = true;
                        if (dialogOptions.filterCssClass) {
                            if (!value.cssClasses) {
                                value.cssClasses = [];
                            }
                            value.cssClasses.push(dialogOptions.filterCssClass);
                        }
                    }
                });
            }
        }
        $scope.multiSubmit = function (result) {
            entityResource.getByIds(result, $scope.entityType).then(function (ents) {
                $scope.submit(ents);
            });
        };
        /** method to select a search result */
        $scope.selectResult = function (evt, result) {
            if (result.filtered) {
                return;
            }
            result.selected = result.selected === true ? false : true;
            //since result = an entity, we'll pass it in so we don't have to go back to the server
            select(result.name, result.id, result);
            //add/remove to our custom tracked list of selected search results
            if (result.selected) {
                $scope.searchInfo.selectedSearchResults.push(result);
            } else {
                $scope.searchInfo.selectedSearchResults = _.reject($scope.searchInfo.selectedSearchResults, function (i) {
                    return i.id == result.id;
                });
            }
            //ensure the tree node in the tree is checked/unchecked if it already exists there
            if (tree) {
                var found = treeService.getDescendantNode(tree.root, result.id);
                if (found) {
                    found.selected = result.selected;
                }
            }
        };
        $scope.hideSearch = function () {
            //Traverse the entire displayed tree and update each node to sync with the selected search results
            if (tree) {
                //we need to ensure that any currently displayed nodes that get selected
                // from the search get updated to have a check box!
                function checkChildren(children) {
                    _.each(children, function (child) {
                        //check if the id is in the selection, if so ensure it's flagged as selected
                        var exists = _.find($scope.searchInfo.selectedSearchResults, function (selected) {
                            return child.id == selected.id;
                        });
                        //if the curr node exists in selected search results, ensure it's checked
                        if (exists) {
                            child.selected = true;
                        }    //if the curr node does not exist in the selected search result, and the curr node is a child of a list view search result
                        else if (child.metaData.isSearchResult) {
                            //if this tree node is under a list view it means that the node was added
                            // to the tree dynamically under the list view that was searched, so we actually want to remove
                            // it all together from the tree
                            var listView = child.parent();
                            listView.children = _.reject(listView.children, function (c) {
                                return c.id == child.id;
                            });
                        }
                        //check if the current node is a list view and if so, check if there's any new results
                        // that need to be added as child nodes to it based on search results selected
                        if (child.metaData.isContainer) {
                            child.cssClasses = _.reject(child.cssClasses, function (c) {
                                return c === 'tree-node-slide-up-hide-active';
                            });
                            var listViewResults = _.filter($scope.searchInfo.selectedSearchResults, function (i) {
                                return i.parentId == child.id;
                            });
                            _.each(listViewResults, function (item) {
                                var childExists = _.find(child.children, function (c) {
                                    return c.id == item.id;
                                });
                                if (!childExists) {
                                    var parent = child;
                                    child.children.unshift({
                                        id: item.id,
                                        name: item.name,
                                        cssClass: 'icon umb-tree-icon sprTree ' + item.icon,
                                        level: child.level + 1,
                                        metaData: { isSearchResult: true },
                                        hasChildren: false,
                                        parent: function () {
                                            return parent;
                                        }
                                    });
                                }
                            });
                        }
                        //recurse
                        if (child.children && child.children.length > 0) {
                            checkChildren(child.children);
                        }
                    });
                }
                checkChildren(tree.root.children);
            }
            $scope.searchInfo.showSearch = false;
            $scope.searchInfo.searchFromId = dialogOptions.startNodeId;
            $scope.searchInfo.searchFromName = null;
            $scope.searchInfo.results = [];
        };
        $scope.onSearchResults = function (results) {
            //filter all items - this will mark an item as filtered
            performFiltering(results);
            //now actually remove all filtered items so they are not even displayed
            results = _.filter(results, function (item) {
                return !item.filtered;
            });
            $scope.searchInfo.results = results;
            //sync with the curr selected results
            _.each($scope.searchInfo.results, function (result) {
                var exists = _.find($scope.model.selection, function (selectedId) {
                    return result.id == selectedId;
                });
                if (exists) {
                    result.selected = true;
                }
            });
            $scope.searchInfo.showSearch = true;
        };
        $scope.dialogTreeEventHandler.bind('treeLoaded', treeLoadedHandler);
        $scope.dialogTreeEventHandler.bind('treeNodeExpanded', nodeExpandedHandler);
        $scope.dialogTreeEventHandler.bind('treeNodeSelect', nodeSelectHandler);
        $scope.$on('$destroy', function () {
            $scope.dialogTreeEventHandler.unbind('treeLoaded', treeLoadedHandler);
            $scope.dialogTreeEventHandler.unbind('treeNodeExpanded', nodeExpandedHandler);
            $scope.dialogTreeEventHandler.unbind('treeNodeSelect', nodeSelectHandler);
        });
        $scope.selectListViewNode = function (node) {
            select(node.name, node.id);
            //toggle checked state
            node.selected = node.selected === true ? false : true;
        };
        $scope.closeMiniListView = function () {
            $scope.miniListView = undefined;
        };
        function openMiniListView(node) {
            $scope.miniListView = node;
        }
    });
    angular.module('umbraco').controller('Umbraco.Overlays.UserController', function ($scope, $location, $timeout, dashboardResource, userService, historyService, eventsService, externalLoginInfo, authResource, currentUserResource, formHelper, localizationService) {
        $scope.history = historyService.getCurrent();
        $scope.version = Umbraco.Sys.ServerVariables.application.version + ' assembly: ' + Umbraco.Sys.ServerVariables.application.assemblyVersion;
        $scope.showPasswordFields = false;
        $scope.changePasswordButtonState = 'init';
        $scope.model.subtitle = 'Umbraco version' + ' ' + $scope.version;
        if (!$scope.model.title) {
            $scope.model.title = localizationService.localize('general_user');
        }
        $scope.externalLoginProviders = externalLoginInfo.providers;
        $scope.externalLinkLoginFormAction = Umbraco.Sys.ServerVariables.umbracoUrls.externalLinkLoginsUrl;
        var evts = [];
        evts.push(eventsService.on('historyService.add', function (e, args) {
            $scope.history = args.all;
        }));
        evts.push(eventsService.on('historyService.remove', function (e, args) {
            $scope.history = args.all;
        }));
        evts.push(eventsService.on('historyService.removeAll', function (e, args) {
            $scope.history = [];
        }));
        $scope.logout = function () {
            //Add event listener for when there are pending changes on an editor which means our route was not successful
            var pendingChangeEvent = eventsService.on('valFormManager.pendingChanges', function (e, args) {
                //one time listener, remove the event
                pendingChangeEvent();
                $scope.model.close();
            });
            //perform the path change, if it is successful then the promise will resolve otherwise it will fail
            $scope.model.close();
            $location.path('/logout');
        };
        $scope.gotoHistory = function (link) {
            $location.path(link);
            $scope.model.close();
        };
        //Manually update the remaining timeout seconds
        function updateTimeout() {
            $timeout(function () {
                if ($scope.remainingAuthSeconds > 0) {
                    $scope.remainingAuthSeconds--;
                    $scope.$digest();
                    //recurse
                    updateTimeout();
                }
            }, 1000, false);    // 1 second, do NOT execute a global digest
        }
        function updateUserInfo() {
            //get the user
            userService.getCurrentUser().then(function (user) {
                $scope.user = user;
                if ($scope.user) {
                    $scope.model.title = user.name;
                    $scope.remainingAuthSeconds = $scope.user.remainingAuthSeconds;
                    $scope.canEditProfile = _.indexOf($scope.user.allowedSections, 'users') > -1;
                    //set the timer
                    updateTimeout();
                    authResource.getCurrentUserLinkedLogins().then(function (logins) {
                        //reset all to be un-linked
                        for (var provider in $scope.externalLoginProviders) {
                            $scope.externalLoginProviders[provider].linkedProviderKey = undefined;
                        }
                        //set the linked logins
                        for (var login in logins) {
                            var found = _.find($scope.externalLoginProviders, function (i) {
                                return i.authType == login;
                            });
                            if (found) {
                                found.linkedProviderKey = logins[login];
                            }
                        }
                    });
                }
            });
        }
        $scope.unlink = function (e, loginProvider, providerKey) {
            var result = confirm('Are you sure you want to unlink this account?');
            if (!result) {
                e.preventDefault();
                return;
            }
            authResource.unlinkLogin(loginProvider, providerKey).then(function (a, b, c) {
                updateUserInfo();
            });
        };
        updateUserInfo();
        //remove all event handlers
        $scope.$on('$destroy', function () {
            for (var e = 0; e < evts.length; e++) {
                evts[e]();
            }
        });
        /* ---------- UPDATE PASSWORD ---------- */
        //create the initial model for change password
        $scope.changePasswordModel = {
            config: {},
            value: {}
        };
        //go get the config for the membership provider and add it to the model
        authResource.getMembershipProviderConfig().then(function (data) {
            $scope.changePasswordModel.config = data;
            //ensure the hasPassword config option is set to true (the user of course has a password already assigned)
            //this will ensure the oldPassword is shown so they can change it
            // disable reset password functionality beacuse it does not make sense inside the backoffice
            $scope.changePasswordModel.config.hasPassword = true;
            $scope.changePasswordModel.config.disableToggle = true;
            $scope.changePasswordModel.config.enableReset = false;
        });
        $scope.changePassword = function () {
            if (formHelper.submitForm({ scope: $scope })) {
                $scope.changePasswordButtonState = 'busy';
                currentUserResource.changePassword($scope.changePasswordModel.value).then(function (data) {
                    //reset old data 
                    clearPasswordFields();
                    //if the password has been reset, then update our model
                    if (data.value) {
                        $scope.changePasswordModel.value.generatedPassword = data.value;
                    }
                    formHelper.resetForm({
                        scope: $scope,
                        notifications: data.notifications
                    });
                    $scope.changePasswordButtonState = 'success';
                    $timeout(function () {
                        $scope.togglePasswordFields();
                    }, 2000);
                }, function (err) {
                    formHelper.handleError(err);
                    $scope.changePasswordButtonState = 'error';
                });
            }
        };
        $scope.togglePasswordFields = function () {
            clearPasswordFields();
            $scope.showPasswordFields = !$scope.showPasswordFields;
        };
        function clearPasswordFields() {
            $scope.changePasswordModel.value.oldPassword = '';
            $scope.changePasswordModel.value.newPassword = '';
            $scope.changePasswordModel.value.confirm = '';
        }
        dashboardResource.getDashboard('user-dialog').then(function (dashboard) {
            $scope.dashboard = dashboard;
        });
    });
    (function () {
        'use strict';
        function UserGroupPickerController($scope, userGroupsResource, localizationService) {
            var vm = this;
            vm.userGroups = [];
            vm.loading = false;
            vm.selectUserGroup = selectUserGroup;
            //////////
            function onInit() {
                vm.loading = true;
                // set default title
                if (!$scope.model.title) {
                    $scope.model.title = localizationService.localize('defaultdialogs_selectUsers');
                }
                // make sure we can push to something
                if (!$scope.model.selection) {
                    $scope.model.selection = [];
                }
                // get venues
                userGroupsResource.getUserGroups().then(function (userGroups) {
                    vm.userGroups = userGroups;
                    if ($scope.model.selection && $scope.model.selection.length > 0) {
                        preSelect($scope.model.selection);
                    }
                    vm.loading = false;
                });
            }
            function preSelect(selection) {
                angular.forEach(selection, function (selected) {
                    angular.forEach(vm.userGroups, function (userGroup) {
                        if (selected.id === userGroup.id) {
                            userGroup.selected = true;
                        }
                    });
                });
            }
            function selectUserGroup(userGroup) {
                if (!userGroup.selected) {
                    userGroup.selected = true;
                    $scope.model.selection.push(userGroup);
                } else {
                    angular.forEach($scope.model.selection, function (selectedUserGroup, index) {
                        if (selectedUserGroup.id === userGroup.id) {
                            userGroup.selected = false;
                            $scope.model.selection.splice(index, 1);
                        }
                    });
                }
            }
            onInit();
        }
        angular.module('umbraco').controller('Umbraco.Overlays.UserGroupPickerController', UserGroupPickerController);
    }());
    (function () {
        'use strict';
        function UserPickerController($scope, usersResource, localizationService) {
            var vm = this;
            vm.users = [];
            vm.loading = false;
            vm.usersOptions = {};
            vm.selectUser = selectUser;
            vm.searchUsers = searchUsers;
            vm.changePageNumber = changePageNumber;
            //////////
            function onInit() {
                vm.loading = true;
                // set default title
                if (!$scope.model.title) {
                    $scope.model.title = localizationService.localize('defaultdialogs_selectUsers');
                }
                // make sure we can push to something
                if (!$scope.model.selection) {
                    $scope.model.selection = [];
                }
                // get users
                getUsers();
            }
            function preSelect(selection, users) {
                angular.forEach(selection, function (selected) {
                    angular.forEach(users, function (user) {
                        if (selected.id === user.id) {
                            user.selected = true;
                        }
                    });
                });
            }
            function selectUser(user) {
                if (!user.selected) {
                    user.selected = true;
                    $scope.model.selection.push(user);
                } else {
                    angular.forEach($scope.model.selection, function (selectedUser, index) {
                        if (selectedUser.id === user.id) {
                            user.selected = false;
                            $scope.model.selection.splice(index, 1);
                        }
                    });
                }
            }
            var search = _.debounce(function () {
                $scope.$apply(function () {
                    getUsers();
                });
            }, 500);
            function searchUsers() {
                search();
            }
            function getUsers() {
                vm.loading = true;
                // Get users
                usersResource.getPagedResults(vm.usersOptions).then(function (users) {
                    vm.users = users.items;
                    vm.usersOptions.pageNumber = users.pageNumber;
                    vm.usersOptions.pageSize = users.pageSize;
                    vm.usersOptions.totalItems = users.totalItems;
                    vm.usersOptions.totalPages = users.totalPages;
                    preSelect($scope.model.selection, vm.users);
                    vm.loading = false;
                });
            }
            function changePageNumber(pageNumber) {
                vm.usersOptions.pageNumber = pageNumber;
                getUsers();
            }
            onInit();
        }
        angular.module('umbraco').controller('Umbraco.Overlays.UserPickerController', UserPickerController);
    }());
    angular.module('umbraco').controller('Umbraco.Overlays.YsodController', function ($scope, legacyResource, treeService, navigationService, localizationService) {
        if (!$scope.model.title) {
            $scope.model.title = localizationService.localize('errors_receivedErrorFromServer');
        }
        if ($scope.model.error && $scope.model.error.data && $scope.model.error.data.StackTrace) {
            //trim whitespace
            $scope.model.error.data.StackTrace = $scope.model.error.data.StackTrace.trim();
        }
        if ($scope.model.error && $scope.model.error.data) {
            $scope.model.error.data.InnerExceptions = [];
            var ex = $scope.model.error.data.InnerException;
            while (ex) {
                if (ex.StackTrace) {
                    ex.StackTrace = ex.StackTrace.trim();
                }
                $scope.model.error.data.InnerExceptions.push(ex);
                ex = ex.InnerException;
            }
        }
    });
    (function () {
        'use strict';
        function NodeNameController($scope) {
            var vm = this;
            var element = angular.element($scope.model.currentStep.element);
            vm.error = false;
            vm.initNextStep = initNextStep;
            function initNextStep() {
                if (element.val().toLowerCase() === 'home') {
                    $scope.model.nextStep();
                } else {
                    vm.error = true;
                }
            }
        }
        angular.module('umbraco').controller('Umbraco.Tours.UmbIntroCreateContent.NodeNameController', NodeNameController);
    }());
    (function () {
        'use strict';
        function DocTypeNameController($scope) {
            var vm = this;
            var element = angular.element($scope.model.currentStep.element);
            vm.error = false;
            vm.initNextStep = initNextStep;
            function initNextStep() {
                if (element.val().toLowerCase() === 'home page') {
                    $scope.model.nextStep();
                } else {
                    vm.error = true;
                }
            }
        }
        angular.module('umbraco').controller('Umbraco.Tours.UmbIntroCreateDocType.DocTypeNameController', DocTypeNameController);
    }());
    (function () {
        'use strict';
        function PropertyNameController($scope) {
            var vm = this;
            var element = angular.element($scope.model.currentStep.element);
            vm.error = false;
            vm.initNextStep = initNextStep;
            function initNextStep() {
                if (element.val().toLowerCase() === 'welcome text') {
                    $scope.model.nextStep();
                } else {
                    vm.error = true;
                }
            }
        }
        angular.module('umbraco').controller('Umbraco.Tours.UmbIntroCreateDocType.PropertyNameController', PropertyNameController);
    }());
    (function () {
        'use strict';
        function TabNameController($scope) {
            var vm = this;
            var element = angular.element($scope.model.currentStep.element);
            vm.error = false;
            vm.initNextStep = initNextStep;
            function initNextStep() {
                if (element.val().toLowerCase() === 'home') {
                    $scope.model.nextStep();
                } else {
                    vm.error = true;
                }
            }
        }
        angular.module('umbraco').controller('Umbraco.Tours.UmbIntroCreateDocType.TabNameController', TabNameController);
    }());
    (function () {
        'use strict';
        function FolderNameController($scope) {
            var vm = this;
            var element = angular.element($scope.model.currentStep.element);
            vm.error = false;
            vm.initNextStep = initNextStep;
            function initNextStep() {
                if (element.val().toLowerCase() === 'my images') {
                    $scope.model.nextStep();
                } else {
                    vm.error = true;
                }
            }
        }
        angular.module('umbraco').controller('Umbraco.Tours.UmbIntroMediaSection.FolderNameController', FolderNameController);
    }());
    (function () {
        'use strict';
        function UploadImagesController($scope, editorState, mediaResource) {
            var vm = this;
            var element = angular.element($scope.model.currentStep.element);
            vm.error = false;
            vm.initNextStep = initNextStep;
            function initNextStep() {
                vm.error = false;
                vm.buttonState = 'busy';
                var currentNode = editorState.getCurrent();
                // make sure we have uploaded at least one image
                mediaResource.getChildren(currentNode.id).then(function (data) {
                    var children = data;
                    if (children.items && children.items.length > 0) {
                        $scope.model.nextStep();
                    } else {
                        vm.error = true;
                    }
                    vm.buttonState = 'init';
                });
            }
        }
        angular.module('umbraco').controller('Umbraco.Tours.UmbIntroMediaSection.UploadImagesController', UploadImagesController);
    }());
    (function () {
        'use strict';
        function TemplatesTreeController($scope) {
            var vm = this;
            var eventElement = angular.element($scope.model.currentStep.eventElement);
            function onInit() {
                // check if tree is already open - if it is - go to next step
                if (eventElement.hasClass('icon-navigation-down')) {
                    $scope.model.nextStep();
                }
            }
            onInit();
        }
        angular.module('umbraco').controller('Umbraco.Tours.UmbIntroRenderInTemplate.TemplatesTreeController', TemplatesTreeController);
    }());
    angular.module('umbraco').controller('Umbraco.Editors.Content.CopyController', function ($scope, userService, eventsService, contentResource, navigationService, appState, treeService, localizationService, notificationsService) {
        var dialogOptions = $scope.dialogOptions;
        var searchText = 'Search...';
        localizationService.localize('general_search').then(function (value) {
            searchText = value + '...';
        });
        $scope.relateToOriginal = true;
        $scope.recursive = true;
        $scope.dialogTreeEventHandler = $({});
        $scope.busy = false;
        $scope.searchInfo = {
            searchFromId: null,
            searchFromName: null,
            showSearch: false,
            results: [],
            selectedSearchResults: []
        };
        $scope.treeModel = { hideHeader: false };
        $scope.toggle = toggleHandler;
        userService.getCurrentUser().then(function (userData) {
            $scope.treeModel.hideHeader = userData.startContentIds.length > 0 && userData.startContentIds.indexOf(-1) == -1;
        });
        var node = dialogOptions.currentNode;
        function treeLoadedHandler(ev, args) {
            if (node && node.path) {
                $scope.dialogTreeEventHandler.syncTree({
                    path: node.path,
                    activate: false
                });
            }
        }
        function nodeSelectHandler(ev, args) {
            if (args && args.event) {
                args.event.preventDefault();
                args.event.stopPropagation();
            }
            eventsService.emit('editors.content.copyController.select', args);
            if ($scope.target) {
                //un-select if there's a current one selected
                $scope.target.selected = false;
            }
            $scope.target = args.node;
            $scope.target.selected = true;
        }
        function nodeExpandedHandler(ev, args) {
            // open mini list view for list views
            if (args.node.metaData.isContainer) {
                openMiniListView(args.node);
            }
        }
        function toggleHandler(type) {
            // If the relateToOriginal toggle is clicked
            if (type === 'relate') {
                if ($scope.relateToOriginal) {
                    $scope.relateToOriginal = false;
                    return;
                }
                $scope.relateToOriginal = true;
            }
            // If the recurvise toggle is clicked
            if (type === 'recursive') {
                if ($scope.recursive) {
                    $scope.recursive = false;
                    return;
                }
                $scope.recursive = true;
            }
        }
        $scope.hideSearch = function () {
            $scope.searchInfo.showSearch = false;
            $scope.searchInfo.searchFromId = null;
            $scope.searchInfo.searchFromName = null;
            $scope.searchInfo.results = [];
        };
        // method to select a search result
        $scope.selectResult = function (evt, result) {
            result.selected = result.selected === true ? false : true;
            nodeSelectHandler(evt, {
                event: evt,
                node: result
            });
        };
        //callback when there are search results
        $scope.onSearchResults = function (results) {
            $scope.searchInfo.results = results;
            $scope.searchInfo.showSearch = true;
        };
        $scope.copy = function () {
            $scope.busy = true;
            $scope.error = false;
            contentResource.copy({
                parentId: $scope.target.id,
                id: node.id,
                relateToOriginal: $scope.relateToOriginal,
                recursive: $scope.recursive
            }).then(function (path) {
                $scope.error = false;
                $scope.success = true;
                $scope.busy = false;
                //get the currently edited node (if any)
                var activeNode = appState.getTreeState('selectedNode');
                //we need to do a double sync here: first sync to the copied content - but don't activate the node,
                //then sync to the currenlty edited content (note: this might not be the content that was copied!!)
                navigationService.syncTree({
                    tree: 'content',
                    path: path,
                    forceReload: true,
                    activate: false
                }).then(function (args) {
                    if (activeNode) {
                        var activeNodePath = treeService.getPath(activeNode).join();
                        //sync to this node now - depending on what was copied this might already be synced but might not be
                        navigationService.syncTree({
                            tree: 'content',
                            path: activeNodePath,
                            forceReload: false,
                            activate: true
                        });
                    }
                });
            }, function (err) {
                $scope.success = false;
                $scope.error = err;
                $scope.busy = false;
                //show any notifications
                if (angular.isArray(err.data.notifications)) {
                    for (var i = 0; i < err.data.notifications.length; i++) {
                        notificationsService.showNotification(err.data.notifications[i]);
                    }
                }
            });
        };
        $scope.dialogTreeEventHandler.bind('treeLoaded', treeLoadedHandler);
        $scope.dialogTreeEventHandler.bind('treeNodeSelect', nodeSelectHandler);
        $scope.dialogTreeEventHandler.bind('treeNodeExpanded', nodeExpandedHandler);
        $scope.$on('$destroy', function () {
            $scope.dialogTreeEventHandler.unbind('treeLoaded', treeLoadedHandler);
            $scope.dialogTreeEventHandler.unbind('treeNodeSelect', nodeSelectHandler);
            $scope.dialogTreeEventHandler.unbind('treeNodeExpanded', nodeExpandedHandler);
        });
        // Mini list view
        $scope.selectListViewNode = function (node) {
            node.selected = node.selected === true ? false : true;
            nodeSelectHandler({}, { node: node });
        };
        $scope.closeMiniListView = function () {
            $scope.miniListView = undefined;
        };
        function openMiniListView(node) {
            $scope.miniListView = node;
        }
    });
    /**
 * @ngdoc controller
 * @name Umbraco.Editors.Content.CreateController
 * @function
 * 
 * @description
 * The controller for the content creation dialog
 */
    function contentCreateController($scope, $routeParams, contentTypeResource, iconHelper, $location, navigationService, blueprintConfig) {
        function initialize() {
            contentTypeResource.getAllowedTypes($scope.currentNode.id).then(function (data) {
                $scope.allowedTypes = iconHelper.formatContentTypeIcons(data);
            });
            $scope.selectContentType = true;
            $scope.selectBlueprint = false;
            $scope.allowBlank = blueprintConfig.allowBlank;
        }
        function close() {
            navigationService.hideMenu();
        }
        function createBlank(docType) {
            $location.path('/content/content/edit/' + $scope.currentNode.id).search('doctype=' + docType.alias + '&create=true');
            close();
        }
        function createOrSelectBlueprintIfAny(docType) {
            var blueprintIds = _.keys(docType.blueprints || {});
            $scope.docType = docType;
            if (blueprintIds.length) {
                if (blueprintConfig.skipSelect) {
                    createFromBlueprint(blueprintIds[0]);
                } else {
                    $scope.selectContentType = false;
                    $scope.selectBlueprint = true;
                }
            } else {
                createBlank(docType);
            }
        }
        function createFromBlueprint(blueprintId) {
            $location.path('/content/content/edit/' + $scope.currentNode.id).search('doctype=' + $scope.docType.alias + '&create=true&blueprintId=' + blueprintId);
            close();
        }
        $scope.createBlank = createBlank;
        $scope.createOrSelectBlueprintIfAny = createOrSelectBlueprintIfAny;
        $scope.createFromBlueprint = createFromBlueprint;
        initialize();
    }
    angular.module('umbraco').controller('Umbraco.Editors.Content.CreateController', contentCreateController);
    angular.module('umbraco').value('blueprintConfig', {
        skipSelect: false,
        allowBlank: true
    });
    (function () {
        function CreateBlueprintController($scope, contentResource, notificationsService, navigationService, localizationService, formHelper, contentEditingHelper) {
            $scope.message = { name: $scope.currentNode.name };
            var successText = {};
            localizationService.localize('blueprints_createBlueprintFrom', ['<em>' + $scope.message.name + '</em>']).then(function (localizedVal) {
                $scope.title = localizedVal;
            });
            $scope.cancel = function () {
                navigationService.hideMenu();
            };
            $scope.create = function () {
                if (formHelper.submitForm({
                        scope: $scope,
                        formCtrl: this.blueprintForm,
                        statusMessage: 'Creating blueprint...'
                    })) {
                    contentResource.createBlueprintFromContent($scope.currentNode.id, $scope.message.name).then(function (data) {
                        formHelper.resetForm({
                            scope: $scope,
                            notifications: data.notifications
                        });
                        navigationService.hideMenu();
                    }, function (err) {
                        contentEditingHelper.handleSaveError({
                            redirectOnFailure: false,
                            err: err
                        });
                    });
                }
            };
        }
        angular.module('umbraco').controller('Umbraco.Editors.Content.CreateBlueprintController', CreateBlueprintController);
    }());
    /**
 * @ngdoc controller
 * @name Umbraco.Editors.ContentDeleteController
 * @function
 * 
 * @description
 * The controller for deleting content
 */
    function ContentDeleteController($scope, contentResource, treeService, navigationService, editorState, $location, dialogService, notificationsService) {
        $scope.performDelete = function () {
            // stop from firing again on double-click
            if ($scope.busy) {
                return false;
            }
            //mark it for deletion (used in the UI)
            $scope.currentNode.loading = true;
            $scope.busy = true;
            contentResource.deleteById($scope.currentNode.id).then(function () {
                $scope.currentNode.loading = false;
                //get the root node before we remove it
                var rootNode = treeService.getTreeRoot($scope.currentNode);
                treeService.removeNode($scope.currentNode);
                if (rootNode) {
                    //ensure the recycle bin has child nodes now            
                    var recycleBin = treeService.getDescendantNode(rootNode, -20);
                    if (recycleBin) {
                        recycleBin.hasChildren = true;
                        //reload the recycle bin if it's already expanded so the deleted item is shown
                        if (recycleBin.expanded) {
                            treeService.loadNodeChildren({
                                node: recycleBin,
                                section: 'content'
                            });
                        }
                    }
                }
                //if the current edited item is the same one as we're deleting, we need to navigate elsewhere
                if (editorState.current && editorState.current.id == $scope.currentNode.id) {
                    //If the deleted item lived at the root then just redirect back to the root, otherwise redirect to the item's parent
                    var location = '/content';
                    if ($scope.currentNode.parentId.toString() === '-20')
                        location = '/content/content/recyclebin';
                    else if ($scope.currentNode.parentId.toString() !== '-1')
                        location = '/content/content/edit/' + $scope.currentNode.parentId;
                    $location.path(location);
                }
                $scope.success = true;
            }, function (err) {
                $scope.currentNode.loading = false;
                $scope.busy = false;
                //check if response is ysod
                if (err.status && err.status >= 500) {
                    dialogService.ysodDialog(err);
                }
                if (err.data && angular.isArray(err.data.notifications)) {
                    for (var i = 0; i < err.data.notifications.length; i++) {
                        notificationsService.showNotification(err.data.notifications[i]);
                    }
                }
            });
        };
        $scope.cancel = function () {
            navigationService.hideDialog();
        };
    }
    angular.module('umbraco').controller('Umbraco.Editors.Content.DeleteController', ContentDeleteController);
    /**
 * @ngdoc controller
 * @name Umbraco.Editors.Content.EditController
 * @function
 * 
 * @description
 * The controller for the content editor
 */
    function ContentEditController($scope, $routeParams, contentResource) {
        function scaffoldEmpty() {
            return contentResource.getScaffold($routeParams.id, $routeParams.doctype);
        }
        function scaffoldBlueprint() {
            return contentResource.getBlueprintScaffold($routeParams.id, $routeParams.blueprintId);
        }
        $scope.contentId = $routeParams.id;
        $scope.saveMethod = contentResource.save;
        $scope.getMethod = contentResource.getById;
        $scope.getScaffoldMethod = $routeParams.blueprintId ? scaffoldBlueprint : scaffoldEmpty;
        $scope.page = $routeParams.page;
        $scope.isNew = $routeParams.create;
    }
    angular.module('umbraco').controller('Umbraco.Editors.Content.EditController', ContentEditController);
    /**
 * @ngdoc controller
 * @name Umbraco.Editors.Content.EmptyRecycleBinController
 * @function
 * 
 * @description
 * The controller for deleting content
 */
    function ContentEmptyRecycleBinController($scope, contentResource, treeService, navigationService, notificationsService, $route) {
        $scope.busy = false;
        $scope.performDelete = function () {
            //(used in the UI)
            $scope.busy = true;
            $scope.currentNode.loading = true;
            contentResource.emptyRecycleBin($scope.currentNode.id).then(function (result) {
                $scope.busy = false;
                $scope.currentNode.loading = false;
                //show any notifications
                if (angular.isArray(result.notifications)) {
                    for (var i = 0; i < result.notifications.length; i++) {
                        notificationsService.showNotification(result.notifications[i]);
                    }
                }
                treeService.removeChildNodes($scope.currentNode);
                navigationService.hideMenu();
                //reload the current view
                $route.reload();
            });
        };
        $scope.cancel = function () {
            navigationService.hideDialog();
        };
    }
    angular.module('umbraco').controller('Umbraco.Editors.Content.EmptyRecycleBinController', ContentEmptyRecycleBinController);
    angular.module('umbraco').controller('Umbraco.Editors.Content.MoveController', function ($scope, userService, eventsService, contentResource, navigationService, appState, treeService, localizationService, notificationsService) {
        var dialogOptions = $scope.dialogOptions;
        var searchText = 'Search...';
        localizationService.localize('general_search').then(function (value) {
            searchText = value + '...';
        });
        $scope.dialogTreeEventHandler = $({});
        $scope.busy = false;
        $scope.searchInfo = {
            searchFromId: null,
            searchFromName: null,
            showSearch: false,
            results: [],
            selectedSearchResults: []
        };
        $scope.treeModel = { hideHeader: false };
        userService.getCurrentUser().then(function (userData) {
            $scope.treeModel.hideHeader = userData.startContentIds.length > 0 && userData.startContentIds.indexOf(-1) == -1;
        });
        var node = dialogOptions.currentNode;
        function treeLoadedHandler(ev, args) {
            if (node && node.path) {
                $scope.dialogTreeEventHandler.syncTree({
                    path: node.path,
                    activate: false
                });
            }
        }
        function nodeSelectHandler(ev, args) {
            if (args && args.event) {
                args.event.preventDefault();
                args.event.stopPropagation();
            }
            eventsService.emit('editors.content.moveController.select', args);
            if ($scope.target) {
                //un-select if there's a current one selected
                $scope.target.selected = false;
            }
            $scope.target = args.node;
            $scope.target.selected = true;
        }
        function nodeExpandedHandler(ev, args) {
            // open mini list view for list views
            if (args.node.metaData.isContainer) {
                openMiniListView(args.node);
            }
        }
        $scope.hideSearch = function () {
            $scope.searchInfo.showSearch = false;
            $scope.searchInfo.searchFromId = null;
            $scope.searchInfo.searchFromName = null;
            $scope.searchInfo.results = [];
        };
        // method to select a search result 
        $scope.selectResult = function (evt, result) {
            result.selected = result.selected === true ? false : true;
            nodeSelectHandler(evt, {
                event: evt,
                node: result
            });
        };
        //callback when there are search results 
        $scope.onSearchResults = function (results) {
            $scope.searchInfo.results = results;
            $scope.searchInfo.showSearch = true;
        };
        $scope.move = function () {
            $scope.busy = true;
            $scope.error = false;
            contentResource.move({
                parentId: $scope.target.id,
                id: node.id
            }).then(function (path) {
                $scope.error = false;
                $scope.success = true;
                $scope.busy = false;
                //first we need to remove the node that launched the dialog
                treeService.removeNode($scope.currentNode);
                //get the currently edited node (if any)
                var activeNode = appState.getTreeState('selectedNode');
                //we need to do a double sync here: first sync to the moved content - but don't activate the node,
                //then sync to the currently edited content (note: this might not be the content that was moved!!)
                navigationService.syncTree({
                    tree: 'content',
                    path: path,
                    forceReload: true,
                    activate: false
                }).then(function (args) {
                    if (activeNode) {
                        var activeNodePath = treeService.getPath(activeNode).join();
                        //sync to this node now - depending on what was copied this might already be synced but might not be
                        navigationService.syncTree({
                            tree: 'content',
                            path: activeNodePath,
                            forceReload: false,
                            activate: true
                        });
                    }
                });
            }, function (err) {
                $scope.success = false;
                $scope.error = err;
                $scope.busy = false;
                //show any notifications
                if (angular.isArray(err.data.notifications)) {
                    for (var i = 0; i < err.data.notifications.length; i++) {
                        notificationsService.showNotification(err.data.notifications[i]);
                    }
                }
            });
        };
        $scope.dialogTreeEventHandler.bind('treeLoaded', treeLoadedHandler);
        $scope.dialogTreeEventHandler.bind('treeNodeSelect', nodeSelectHandler);
        $scope.dialogTreeEventHandler.bind('treeNodeExpanded', nodeExpandedHandler);
        $scope.$on('$destroy', function () {
            $scope.dialogTreeEventHandler.unbind('treeLoaded', treeLoadedHandler);
            $scope.dialogTreeEventHandler.unbind('treeNodeSelect', nodeSelectHandler);
            $scope.dialogTreeEventHandler.unbind('treeNodeExpanded', nodeExpandedHandler);
        });
        // Mini list view
        $scope.selectListViewNode = function (node) {
            node.selected = node.selected === true ? false : true;
            nodeSelectHandler({}, { node: node });
        };
        $scope.closeMiniListView = function () {
            $scope.miniListView = undefined;
        };
        function openMiniListView(node) {
            $scope.miniListView = node;
        }
    });
    (function () {
        function CreateNotifyController($scope, contentResource, navigationService, angularHelper, localizationService) {
            var vm = this;
            var currentForm;
            vm.notifyOptions = [];
            vm.save = save;
            vm.cancel = cancel;
            vm.message = { name: $scope.currentNode.name };
            vm.labels = {};
            function onInit() {
                vm.loading = true;
                contentResource.getNotifySettingsById($scope.currentNode.id).then(function (options) {
                    currentForm = angularHelper.getCurrentForm($scope);
                    vm.loading = false;
                    vm.notifyOptions = options;
                });
                localizationService.localize('notifications_editNotifications', [$scope.currentNode.name]).then(function (value) {
                    vm.labels.headline = value;
                });
            }
            function cancel() {
                navigationService.hideMenu();
            }
            ;
            function save(notifyOptions) {
                vm.saveState = 'busy';
                vm.saveError = false;
                vm.saveSuccces = false;
                var selectedString = '';
                angular.forEach(notifyOptions, function (option) {
                    if (option.checked === true && option.notifyCode) {
                        selectedString += option.notifyCode;
                    }
                });
                contentResource.setNotifySettingsById($scope.currentNode.id, selectedString).then(function () {
                    vm.saveState = 'success';
                    vm.saveSuccces = true;
                }, function (error) {
                    vm.saveState = 'error';
                    vm.saveError = error;
                });
            }
            onInit();
        }
        angular.module('umbraco').controller('Umbraco.Editors.Content.CreateNotifyController', CreateNotifyController);
    }());
    /**
 * @ngdoc controller
 * @name Umbraco.Editors.Content.RecycleBinController
 * @function
 * 
 * @description
 * Controls the recycle bin for content
 * 
 */
    function ContentRecycleBinController($scope, $routeParams, contentResource, navigationService, localizationService) {
        //ensures the list view doesn't actually load until we query for the list view config
        // for the section
        $scope.page = {};
        $scope.page.name = 'Recycle Bin';
        $scope.page.nameLocked = true;
        //ensures the list view doesn't actually load until we query for the list view config
        // for the section
        $scope.listViewPath = null;
        $routeParams.id = '-20';
        contentResource.getRecycleBin().then(function (result) {
            //we'll get the 'content item' for the recycle bin, we know that it will contain a single tab and a 
            // single property, so we'll extract that property (list view) and use it's data.
            var listproperty = result.tabs[0].properties[0];
            _.each(listproperty.config, function (val, key) {
                $scope.model.config[key] = val;
            });
            $scope.listViewPath = 'views/propertyeditors/listview/listview.html';
        });
        $scope.model = {
            config: {
                entityType: $routeParams.section,
                layouts: []
            }
        };
        // sync tree node
        navigationService.syncTree({
            tree: 'content',
            path: [
                '-1',
                $routeParams.id
            ],
            forceReload: false
        });
        localizePageName();
        function localizePageName() {
            var pageName = 'general_recycleBin';
            localizationService.localize(pageName).then(function (value) {
                $scope.page.name = value;
            });
        }
    }
    angular.module('umbraco').controller('Umbraco.Editors.Content.RecycleBinController', ContentRecycleBinController);
    angular.module('umbraco').controller('Umbraco.Editors.Content.RestoreController', function ($scope, relationResource, contentResource, navigationService, appState, treeService, userService, localizationService) {
        var dialogOptions = $scope.dialogOptions;
        $scope.source = _.clone(dialogOptions.currentNode);
        $scope.error = null;
        $scope.loading = true;
        $scope.moving = false;
        $scope.success = false;
        $scope.dialogTreeEventHandler = $({});
        $scope.searchInfo = {
            showSearch: false,
            results: [],
            selectedSearchResults: []
        };
        $scope.treeModel = { hideHeader: false };
        userService.getCurrentUser().then(function (userData) {
            $scope.treeModel.hideHeader = userData.startContentIds.length > 0 && userData.startContentIds.indexOf(-1) == -1;
        });
        $scope.labels = {};
        localizationService.localizeMany(['treeHeaders_content']).then(function (data) {
            $scope.labels.treeRoot = data[0];
        });
        function nodeSelectHandler(ev, args) {
            if (args && args.event) {
                args.event.preventDefault();
                args.event.stopPropagation();
            }
            if ($scope.target) {
                //un-select if there's a current one selected
                $scope.target.selected = false;
            }
            $scope.target = args.node;
            $scope.target.selected = true;
        }
        function nodeExpandedHandler(ev, args) {
            // open mini list view for list views
            if (args.node.metaData.isContainer) {
                openMiniListView(args.node);
            }
        }
        $scope.hideSearch = function () {
            $scope.searchInfo.showSearch = false;
            $scope.searchInfo.results = [];
        };
        // method to select a search result 
        $scope.selectResult = function (evt, result) {
            result.selected = result.selected === true ? false : true;
            nodeSelectHandler(evt, {
                event: evt,
                node: result
            });
        };
        //callback when there are search results 
        $scope.onSearchResults = function (results) {
            $scope.searchInfo.results = results;
            $scope.searchInfo.showSearch = true;
        };
        $scope.dialogTreeEventHandler.bind('treeNodeSelect', nodeSelectHandler);
        $scope.dialogTreeEventHandler.bind('treeNodeExpanded', nodeExpandedHandler);
        $scope.$on('$destroy', function () {
            $scope.dialogTreeEventHandler.unbind('treeNodeSelect', nodeSelectHandler);
            $scope.dialogTreeEventHandler.unbind('treeNodeExpanded', nodeExpandedHandler);
        });
        // Mini list view
        $scope.selectListViewNode = function (node) {
            node.selected = node.selected === true ? false : true;
            nodeSelectHandler({}, { node: node });
        };
        $scope.closeMiniListView = function () {
            $scope.miniListView = undefined;
        };
        function openMiniListView(node) {
            $scope.miniListView = node;
        }
        relationResource.getByChildId($scope.source.id, 'relateParentDocumentOnDelete').then(function (data) {
            $scope.loading = false;
            if (!data.length) {
                $scope.moving = true;
                return;
            }
            $scope.relation = data[0];
            if ($scope.relation.parentId == -1) {
                $scope.target = {
                    id: -1,
                    name: $scope.labels.treeRoot
                };
            } else {
                $scope.loading = true;
                contentResource.getById($scope.relation.parentId).then(function (data) {
                    $scope.loading = false;
                    $scope.target = data;
                    // make sure the target item isn't in the recycle bin
                    if ($scope.target.path.indexOf('-20') !== -1) {
                        $scope.moving = true;
                        $scope.target = null;
                    }
                }, function (err) {
                    $scope.loading = false;
                    $scope.error = err;
                });
            }
        }, function (err) {
            $scope.loading = false;
            $scope.error = err;
        });
        $scope.restore = function () {
            $scope.loading = true;
            // this code was copied from `content.move.controller.js`
            contentResource.move({
                parentId: $scope.target.id,
                id: $scope.source.id
            }).then(function (path) {
                $scope.loading = false;
                $scope.success = true;
                //first we need to remove the node that launched the dialog
                treeService.removeNode($scope.currentNode);
                //get the currently edited node (if any)
                var activeNode = appState.getTreeState('selectedNode');
                //we need to do a double sync here: first sync to the moved content - but don't activate the node,
                //then sync to the currenlty edited content (note: this might not be the content that was moved!!)
                navigationService.syncTree({
                    tree: 'content',
                    path: path,
                    forceReload: true,
                    activate: false
                }).then(function (args) {
                    if (activeNode) {
                        var activeNodePath = treeService.getPath(activeNode).join();
                        //sync to this node now - depending on what was copied this might already be synced but might not be
                        navigationService.syncTree({
                            tree: 'content',
                            path: activeNodePath,
                            forceReload: false,
                            activate: true
                        });
                    }
                });
            }, function (err) {
                $scope.loading = false;
                $scope.error = err;
            });
        };
    });
    (function () {
        'use strict';
        function ContentRightsController($scope, $timeout, contentResource, localizationService, angularHelper) {
            var vm = this;
            var currentForm;
            vm.availableUserGroups = [];
            vm.selectedUserGroups = [];
            vm.removedUserGroups = [];
            vm.viewState = 'manageGroups';
            vm.labels = {};
            vm.showNotification = false;
            vm.setViewSate = setViewSate;
            vm.editPermissions = editPermissions;
            vm.setPermissions = setPermissions;
            vm.save = save;
            vm.removePermissions = removePermissions;
            vm.cancelManagePermissions = cancelManagePermissions;
            vm.closeDialog = closeDialog;
            vm.stay = stay;
            function onInit() {
                vm.loading = true;
                contentResource.getDetailedPermissions($scope.currentNode.id).then(function (userGroups) {
                    initData(userGroups);
                    vm.loading = false;
                    currentForm = angularHelper.getCurrentForm($scope);
                });
            }
            /**
        * This will initialize the data and set the correct selectedUserGroups based on the default permissions and explicit permissions assigned
        * @param {any} userGroups
        */
            function initData(userGroups) {
                //reset this
                vm.selectedUserGroups = [];
                vm.availableUserGroups = userGroups;
                angular.forEach(vm.availableUserGroups, function (group) {
                    if (group.permissions) {
                        //if there's explicit permissions assigned than it's selected
                        assignGroupPermissions(group);
                    }
                });
            }
            function setViewSate(state) {
                vm.viewState = state;
            }
            function editPermissions(group) {
                vm.selectedUserGroup = group;
                if (!vm.selectedUserGroup.permissions) {
                    //if no permissions are explicitly set this means we need to show the defaults
                    vm.selectedUserGroup.permissions = vm.selectedUserGroup.defaultPermissions;
                }
                localizationService.localize('defaultdialogs_permissionsSetForGroup', [
                    $scope.currentNode.name,
                    vm.selectedUserGroup.name
                ]).then(function (value) {
                    vm.labels.permissionsSetForGroup = value;
                });
                setViewSate('managePermissions');
            }
            function assignGroupPermissions(group) {
                // clear allowed permissions before we make the list so we don't have duplicates
                group.allowedPermissions = [];
                // get list of checked permissions
                angular.forEach(group.permissions, function (permissionGroup) {
                    angular.forEach(permissionGroup, function (permission) {
                        if (permission.checked) {
                            //the `allowedPermissions` is what will get sent up to the server for saving
                            group.allowedPermissions.push(permission);
                        }
                    });
                });
                if (!group.selected) {
                    // set to selected so we can remove from the dropdown easily
                    group.selected = true;
                    vm.selectedUserGroups.push(group);
                    //remove from the removed groups if it's been re-added
                    vm.removedUserGroups = _.reject(vm.removedUserGroups, function (g) {
                        return g.id == group.id;
                    });
                }
            }
            function setPermissions(group) {
                assignGroupPermissions(group);
                setViewSate('manageGroups');
            }
            /**
         * This essentially resets the permissions for a group for this content item, it will remove it from the selected list
         * @param {any} index
         */
            function removePermissions(index) {
                // remove as selected so we can select it from the dropdown again
                var group = vm.selectedUserGroups[index];
                group.selected = false;
                //reset assigned permissions - so it will default back to default permissions
                group.permissions = [];
                group.allowedPermissions = [];
                vm.selectedUserGroups.splice(index, 1);
                //track it in the removed so this gets pushed to the server
                vm.removedUserGroups.push(group);
            }
            function cancelManagePermissions() {
                setViewSate('manageGroups');
            }
            function formatSaveModel(permissionsSave, groupCollection) {
                angular.forEach(groupCollection, function (g) {
                    permissionsSave[g.id] = [];
                    angular.forEach(g.allowedPermissions, function (p) {
                        permissionsSave[g.id].push(p.permissionCode);
                    });
                });
            }
            function save() {
                vm.saveState = 'busy';
                vm.saveError = false;
                vm.saveSuccces = false;
                //this is a dictionary that we need to populate
                var permissionsSave = {};
                //format the selectedUserGroups, then the removedUserGroups since we want to pass data from both collections up
                formatSaveModel(permissionsSave, vm.selectedUserGroups);
                formatSaveModel(permissionsSave, vm.removedUserGroups);
                var saveModel = {
                    contentId: $scope.currentNode.id,
                    permissions: permissionsSave
                };
                contentResource.savePermissions(saveModel).then(function (userGroups) {
                    //re-assign model from server since it could have changed
                    initData(userGroups);
                    // clear dirty state on the form so we don't see the discard changes notification
                    // we use a timeout here because in some cases the initData reformats the userGroups model and triggers a change after the form state was changed
                    $timeout(function () {
                        if (currentForm) {
                            currentForm.$dirty = false;
                        }
                    });
                    vm.saveState = 'success';
                    vm.saveSuccces = true;
                }, function (error) {
                    vm.saveState = 'error';
                    vm.saveError = error;
                });
            }
            function stay() {
                vm.showNotification = false;
            }
            function closeDialog() {
                // check if form has been changed. If it has show discard changes notification
                if (currentForm && currentForm.$dirty) {
                    vm.showNotification = true;
                } else {
                    $scope.nav.hideDialog();
                }
            }
            onInit();
        }
        angular.module('umbraco').controller('Umbraco.Editors.Content.RightsController', ContentRightsController);
    }());
    /**
 * @ngdoc controller
 * @name Umbraco.Editors.ContentBlueprint.CreateController
 * @function
 *
 * @description
 * The controller for creating content blueprints
 */
    function ContentBlueprintCreateController($scope, $location, contentTypeResource, navigationService) {
        var vm = this;
        var node = $scope.dialogOptions.currentNode;
        vm.createBlueprint = createBlueprint;
        function onInit() {
            vm.loading = true;
            contentTypeResource.getAll().then(function (documentTypes) {
                vm.documentTypes = documentTypes;
                vm.loading = false;
            });
        }
        function createBlueprint(documentType) {
            $location.path('/settings/contentBlueprints/edit/' + node.id).search('create', 'true').search('doctype', documentType.alias);
            navigationService.hideMenu();
        }
        onInit();
    }
    angular.module('umbraco').controller('Umbraco.Editors.ContentBlueprint.CreateController', ContentBlueprintCreateController);
    /**
 * @ngdoc controller
 * @name Umbraco.Editors.ContentBlueprint.DeleteController
 * @function
 *
 * @description
 * The controller for deleting content blueprints
 */
    function ContentBlueprintDeleteController($scope, contentResource, treeService, navigationService) {
        $scope.performDelete = function () {
            //mark it for deletion (used in the UI)
            $scope.currentNode.loading = true;
            contentResource.deleteBlueprint($scope.currentNode.id).then(function () {
                $scope.currentNode.loading = false;
                //get the root node before we remove it
                var rootNode = treeService.getTreeRoot($scope.currentNode);
                //TODO: Need to sync tree, etc...
                treeService.removeNode($scope.currentNode);
                navigationService.hideMenu();
            });
        };
        $scope.cancel = function () {
            navigationService.hideDialog();
        };
    }
    angular.module('umbraco').controller('Umbraco.Editors.ContentBlueprint.DeleteController', ContentBlueprintDeleteController);
    /**
 * @ngdoc controller
 * @name Umbraco.Editors.Content.EditController
 * @function
 * 
 * @description
 * The controller for the content editor
 */
    function ContentBlueprintEditController($scope, $routeParams, contentResource) {
        var excludedProps = [
            '_umb_urls',
            '_umb_releasedate',
            '_umb_expiredate',
            '_umb_template'
        ];
        function getScaffold() {
            return contentResource.getScaffold(-1, $routeParams.doctype).then(function (scaffold) {
                var lastTab = scaffold.tabs[scaffold.tabs.length - 1];
                lastTab.properties = _.filter(lastTab.properties, function (p) {
                    return excludedProps.indexOf(p.alias) === -1;
                });
                scaffold.allowPreview = false;
                scaffold.allowedActions = [
                    'A',
                    'S',
                    'C'
                ];
                return scaffold;
            });
        }
        $scope.contentId = $routeParams.id;
        $scope.isNew = $routeParams.id === '-1';
        $scope.saveMethod = contentResource.saveBlueprint;
        $scope.getMethod = contentResource.getBlueprintById;
        $scope.getScaffoldMethod = getScaffold;
    }
    angular.module('umbraco').controller('Umbraco.Editors.ContentBlueprint.EditController', ContentBlueprintEditController);
    function startUpVideosDashboardController($scope, xmlhelper, $log, $http) {
        $scope.videos = [];
        $scope.init = function (url) {
            var proxyUrl = 'dashboard/feedproxy.aspx?url=' + url;
            $http.get(proxyUrl).then(function (data) {
                var feed = $(data.data);
                $('item', feed).each(function (i, item) {
                    var video = {};
                    video.thumbnail = $(item).find('thumbnail').attr('url');
                    video.title = $('title', item).text();
                    video.link = $('guid', item).text();
                    $scope.videos.push(video);
                });
            });
        };
    }
    angular.module('umbraco').controller('Umbraco.Dashboard.StartupVideosController', startUpVideosDashboardController);
    function startUpDynamicContentController($timeout, $scope, dashboardResource, assetsService, tourService, eventsService) {
        var vm = this;
        var evts = [];
        vm.loading = true;
        vm.showDefault = false;
        vm.startTour = startTour;
        function onInit() {
            // load tours
            tourService.getGroupedTours().then(function (groupedTours) {
                vm.tours = groupedTours;
            });
        }
        function startTour(tour) {
            tourService.startTour(tour);
        }
        // default dashboard content
        vm.defaultDashboard = {
            infoBoxes: [
                {
                    title: 'Documentation',
                    description: 'Find the answers to your Umbraco questions',
                    url: 'https://our.umbraco.com/documentation/?utm_source=core&utm_medium=dashboard&utm_content=text&utm_campaign=documentation/'
                },
                {
                    title: 'Community',
                    description: 'Find the answers or ask your Umbraco questions',
                    url: 'https://our.umbraco.com/?utm_source=core&utm_medium=dashboard&utm_content=text&utm_campaign=our_forum'
                },
                {
                    title: 'Umbraco.tv',
                    description: 'Tutorial videos (some are free, some are on subscription)',
                    url: 'https://umbraco.tv/?utm_source=core&utm_medium=dashboard&utm_content=text&utm_campaign=tutorial_videos'
                },
                {
                    title: 'Training',
                    description: 'Real-life training and official Umbraco certifications',
                    url: 'https://umbraco.com/training/?utm_source=core&utm_medium=dashboard&utm_content=text&utm_campaign=training'
                }
            ],
            articles: [
                {
                    title: 'Umbraco.TV - Learn from the source!',
                    description: 'Umbraco.TV will help you go from zero to Umbraco hero at a pace that suits you. Our easy to follow online training videos will give you the fundamental knowledge to start building awesome Umbraco websites.',
                    img: 'views/dashboard/default/umbracotv.jpg',
                    url: 'https://umbraco.tv/?utm_source=core&utm_medium=dashboard&utm_content=image&utm_campaign=tv',
                    altText: 'Umbraco.TV - Hours of Umbraco Video Tutorials',
                    buttonText: 'Visit Umbraco.TV'
                },
                {
                    title: 'Our Umbraco - The Friendliest Community',
                    description: 'Our Umbraco - the official community site is your one stop for everything Umbraco. Whether you need a question answered or looking for cool plugins, the world\'s best and friendliest community is just a click away.',
                    img: 'views/dashboard/default/ourumbraco.jpg',
                    url: 'https://our.umbraco.com/?utm_source=core&utm_medium=dashboard&utm_content=image&utm_campaign=our',
                    altText: 'Our Umbraco',
                    buttonText: 'Visit Our Umbraco'
                }
            ]
        };
        evts.push(eventsService.on('appState.tour.complete', function (name, completedTour) {
            $timeout(function () {
                angular.forEach(vm.tours, function (tourGroup) {
                    angular.forEach(tourGroup, function (tour) {
                        if (tour.alias === completedTour.alias) {
                            tour.completed = true;
                        }
                    });
                });
            });
        }));
        //proxy remote css through the local server
        assetsService.loadCss(dashboardResource.getRemoteDashboardCssUrl('content'), $scope);
        dashboardResource.getRemoteDashboardContent('content').then(function (data) {
            vm.loading = false;
            //test if we have received valid data
            //we capture it like this, so we avoid UI errors - which automatically triggers ui based on http response code
            if (data && data.sections) {
                vm.dashboard = data;
            } else {
                vm.showDefault = true;
            }
        }, function (exception) {
            console.error(exception);
            vm.loading = false;
            vm.showDefault = true;
        });
        onInit();
    }
    angular.module('umbraco').controller('Umbraco.Dashboard.StartUpDynamicContentController', startUpDynamicContentController);
    function FormsController($scope, $route, $cookieStore, packageResource, localizationService) {
        $scope.installForms = function () {
            $scope.state = localizationService.localize('packager_installStateDownloading');
            packageResource.fetch('CD44CF39-3D71-4C19-B6EE-948E1FAF0525').then(function (pack) {
                $scope.state = localizationService.localize('packager_installStateImporting');
                return packageResource.import(pack);
            }, $scope.error).then(function (pack) {
                $scope.state = localizationService.localize('packager_installStateInstalling');
                return packageResource.installFiles(pack);
            }, $scope.error).then(function (pack) {
                $scope.state = localizationService.localize('packager_installStateRestarting');
                return packageResource.installData(pack);
            }, $scope.error).then(function (pack) {
                $scope.state = localizationService.localize('packager_installStateComplete');
                return packageResource.cleanUp(pack);
            }, $scope.error).then($scope.complete, $scope.error);
        };
        $scope.complete = function (result) {
            var url = window.location.href + '?init=true';
            $cookieStore.put('umbPackageInstallId', result.packageGuid);
            window.location.reload(true);
        };
        $scope.error = function (err) {
            $scope.state = undefined;
            $scope.error = err;
            //This will return a rejection meaning that the promise change above will stop
            return $q.reject();
        };
        function Video_player(videoId) {
            // Get dom elements
            this.container = document.getElementById(videoId);
            this.video = this.container.getElementsByTagName('video')[0];
            //Create controls
            this.controls = document.createElement('div');
            this.controls.className = 'video-controls';
            this.seek_bar = document.createElement('input');
            this.seek_bar.className = 'seek-bar';
            this.seek_bar.type = 'range';
            this.seek_bar.setAttribute('value', '0');
            this.loader = document.createElement('div');
            this.loader.className = 'loader';
            this.progress_bar = document.createElement('span');
            this.progress_bar.className = 'progress-bar';
            // Insert controls
            this.controls.appendChild(this.seek_bar);
            this.container.appendChild(this.controls);
            this.controls.appendChild(this.loader);
            this.loader.appendChild(this.progress_bar);
        }
        Video_player.prototype.seeking = function () {
            // get the value of the seekbar (hidden input[type="range"])
            var time = this.video.duration * (this.seek_bar.value / 100);
            // Update video to seekbar value
            this.video.currentTime = time;
        };
        // Stop video when user initiates seeking
        Video_player.prototype.start_seek = function () {
            this.video.pause();
        };
        // Start video when user stops seeking
        Video_player.prototype.stop_seek = function () {
            this.video.play();
        };
        // Update the progressbar (span.loader) according to video.currentTime
        Video_player.prototype.update_progress_bar = function () {
            // Get video progress in %
            var value = 100 / this.video.duration * this.video.currentTime;
            // Update progressbar
            this.progress_bar.style.width = value + '%';
        };
        // Bind progressbar to mouse when seeking
        Video_player.prototype.handle_mouse_move = function (event) {
            // Get position of progressbar relative to browser window
            var pos = this.progress_bar.getBoundingClientRect().left;
            // Make sure event is reckonized cross-browser
            event = event || window.event;
            // Update progressbar
            this.progress_bar.style.width = event.clientX - pos + 'px';
        };
        // Eventlisteners for seeking
        Video_player.prototype.video_event_handler = function (videoPlayer, interval) {
            // Update the progress bar
            var animate_progress_bar = setInterval(function () {
                videoPlayer.update_progress_bar();
            }, interval);
            // Fire when input value changes (user seeking)
            videoPlayer.seek_bar.addEventListener('change', function () {
                videoPlayer.seeking();
            });
            // Fire when user clicks on seekbar
            videoPlayer.seek_bar.addEventListener('mousedown', function (clickEvent) {
                // Pause video playback
                videoPlayer.start_seek();
                // Stop updating progressbar according to video progress
                clearInterval(animate_progress_bar);
                // Update progressbar to where user clicks
                videoPlayer.handle_mouse_move(clickEvent);
                // Bind progressbar to cursor
                window.onmousemove = function (moveEvent) {
                    videoPlayer.handle_mouse_move(moveEvent);
                };
            });
            // Fire when user releases seekbar
            videoPlayer.seek_bar.addEventListener('mouseup', function () {
                // Unbind progressbar from cursor
                window.onmousemove = null;
                // Start video playback
                videoPlayer.stop_seek();
                // Animate the progressbar
                animate_progress_bar = setInterval(function () {
                    videoPlayer.update_progress_bar();
                }, interval);
            });
        };
        var videoPlayer = new Video_player('video_1');
        videoPlayer.video_event_handler(videoPlayer, 17);
    }
    angular.module('umbraco').controller('Umbraco.Dashboard.FormsDashboardController', FormsController);
    function startupLatestEditsController($scope) {
    }
    angular.module('umbraco').controller('Umbraco.Dashboard.StartupLatestEditsController', startupLatestEditsController);
    function MediaFolderBrowserDashboardController($rootScope, $scope, $location, contentTypeResource, userService) {
        var currentUser = {};
        userService.getCurrentUser().then(function (user) {
            currentUser = user;
            // check if the user has access to the root which they will require to see this dashboard
            if (currentUser.startMediaIds.indexOf(-1) >= 0) {
                //get the system media listview
                contentTypeResource.getPropertyTypeScaffold(-96).then(function (dt) {
                    $scope.fakeProperty = {
                        alias: 'contents',
                        config: dt.config,
                        description: '',
                        editor: dt.editor,
                        hideLabel: true,
                        id: 1,
                        label: 'Contents:',
                        validation: {
                            mandatory: false,
                            pattern: null
                        },
                        value: '',
                        view: dt.view
                    };
                });
            } else if (currentUser.startMediaIds.length > 0) {
                // redirect to start node
                $location.path('/media/media/edit/' + (currentUser.startMediaIds.length === 0 ? -1 : currentUser.startMediaIds[0]));
            }
        });
    }
    angular.module('umbraco').controller('Umbraco.Dashboard.MediaFolderBrowserDashboardController', MediaFolderBrowserDashboardController);
    function ExamineMgmtController($scope, umbRequestHelper, $log, $http, $q, $timeout) {
        $scope.indexerDetails = [];
        $scope.searcherDetails = [];
        $scope.loading = true;
        function checkProcessing(indexer, checkActionName) {
            umbRequestHelper.resourcePromise($http.post(umbRequestHelper.getApiUrl('examineMgmtBaseUrl', checkActionName, { indexerName: indexer.name })), 'Failed to check index processing').then(function (data) {
                if (data !== null && data !== 'null') {
                    //copy all resulting properties
                    for (var k in data) {
                        indexer[k] = data[k];
                    }
                    indexer.isProcessing = false;
                } else {
                    $timeout(function () {
                        //don't continue if we've tried 100 times
                        if (indexer.processingAttempts < 100) {
                            checkProcessing(indexer, checkActionName);
                            //add an attempt
                            indexer.processingAttempts++;
                        } else {
                            //we've exceeded 100 attempts, stop processing
                            indexer.isProcessing = false;
                        }
                    }, 1000);
                }
            });
        }
        $scope.search = function (searcher, e) {
            if (e && e.keyCode !== 13) {
                return;
            }
            umbRequestHelper.resourcePromise($http.get(umbRequestHelper.getApiUrl('examineMgmtBaseUrl', 'GetSearchResults', {
                searcherName: searcher.name,
                query: encodeURIComponent(searcher.searchText),
                queryType: searcher.searchType
            })), 'Failed to search').then(function (searchResults) {
                searcher.isSearching = true;
                searcher.searchResults = searchResults;
            });
        };
        $scope.toggle = function (provider, propName) {
            if (provider[propName] !== undefined) {
                provider[propName] = !provider[propName];
            } else {
                provider[propName] = true;
            }
        };
        $scope.rebuildIndex = function (indexer) {
            if (confirm('This will cause the index to be rebuilt. ' + 'Depending on how much content there is in your site this could take a while. ' + 'It is not recommended to rebuild an index during times of high website traffic ' + 'or when editors are editing content.')) {
                indexer.isProcessing = true;
                indexer.processingAttempts = 0;
                umbRequestHelper.resourcePromise($http.post(umbRequestHelper.getApiUrl('examineMgmtBaseUrl', 'PostRebuildIndex', { indexerName: indexer.name })), 'Failed to rebuild index').then(function () {
                    //rebuilding has started, nothing is returned accept a 200 status code.
                    //lets poll to see if it is done.
                    $timeout(function () {
                        checkProcessing(indexer, 'PostCheckRebuildIndex');
                    }, 1000);
                });
            }
        };
        $scope.optimizeIndex = function (indexer) {
            if (confirm('This will cause the index to be optimized which will improve its performance. ' + 'It is not recommended to optimize an index during times of high website traffic ' + 'or when editors are editing content.')) {
                indexer.isProcessing = true;
                umbRequestHelper.resourcePromise($http.post(umbRequestHelper.getApiUrl('examineMgmtBaseUrl', 'PostOptimizeIndex', { indexerName: indexer.name })), 'Failed to optimize index').then(function () {
                    //optimizing has started, nothing is returned accept a 200 status code.
                    //lets poll to see if it is done.
                    $timeout(function () {
                        checkProcessing(indexer, 'PostCheckOptimizeIndex');
                    }, 1000);
                });
            }
        };
        $scope.closeSearch = function (searcher) {
            searcher.isSearching = true;
        };
        //go get the data
        //combine two promises and execute when they are both done
        $q.all([
            //get the indexer details
            umbRequestHelper.resourcePromise($http.get(umbRequestHelper.getApiUrl('examineMgmtBaseUrl', 'GetIndexerDetails')), 'Failed to retrieve indexer details').then(function (data) {
                $scope.indexerDetails = data;
            }),
            //get the searcher details
            umbRequestHelper.resourcePromise($http.get(umbRequestHelper.getApiUrl('examineMgmtBaseUrl', 'GetSearcherDetails')), 'Failed to retrieve searcher details').then(function (data) {
                $scope.searcherDetails = data;
                for (var s in $scope.searcherDetails) {
                    $scope.searcherDetails[s].searchType = 'text';
                }
            })
        ]).then(function () {
            //all init loading is complete
            $scope.loading = false;
        });
    }
    angular.module('umbraco').controller('Umbraco.Dashboard.ExamineMgmtController', ExamineMgmtController);
    (function () {
        'use strict';
        function HealthCheckController($scope, healthCheckResource) {
            var SUCCESS = 0;
            var WARNING = 1;
            var ERROR = 2;
            var INFO = 3;
            var vm = this;
            vm.viewState = 'list';
            vm.groups = [];
            vm.selectedGroup = {};
            vm.getStatus = getStatus;
            vm.executeAction = executeAction;
            vm.checkAllGroups = checkAllGroups;
            vm.checkAllInGroup = checkAllInGroup;
            vm.openGroup = openGroup;
            vm.setViewState = setViewState;
            // Get a (grouped) list of all health checks
            healthCheckResource.getAllChecks().then(function (response) {
                vm.groups = response;
            });
            function setGroupGlobalResultType(group) {
                var totalSuccess = 0;
                var totalError = 0;
                var totalWarning = 0;
                var totalInfo = 0;
                // count total number of statusses
                angular.forEach(group.checks, function (check) {
                    angular.forEach(check.status, function (status) {
                        switch (status.resultType) {
                        case SUCCESS:
                            totalSuccess = totalSuccess + 1;
                            break;
                        case WARNING:
                            totalWarning = totalWarning + 1;
                            break;
                        case ERROR:
                            totalError = totalError + 1;
                            break;
                        case INFO:
                            totalInfo = totalInfo + 1;
                            break;
                        }
                    });
                });
                group.totalSuccess = totalSuccess;
                group.totalError = totalError;
                group.totalWarning = totalWarning;
                group.totalInfo = totalInfo;
            }
            // Get the status of an individual check
            function getStatus(check) {
                check.loading = true;
                check.status = null;
                healthCheckResource.getStatus(check.id).then(function (response) {
                    check.loading = false;
                    check.status = response;
                });
            }
            function executeAction(check, index, action) {
                check.loading = true;
                healthCheckResource.executeAction(action).then(function (response) {
                    check.status[index] = response;
                    check.loading = false;
                });
            }
            function checkAllGroups(groups) {
                // set number of checks which has been executed
                for (var i = 0; i < groups.length; i++) {
                    var group = groups[i];
                    checkAllInGroup(group, group.checks);
                }
                vm.groups = groups;
            }
            function checkAllInGroup(group, checks) {
                group.checkCounter = 0;
                group.loading = true;
                angular.forEach(checks, function (check) {
                    check.loading = true;
                    healthCheckResource.getStatus(check.id).then(function (response) {
                        check.status = response;
                        group.checkCounter = group.checkCounter + 1;
                        check.loading = false;
                        // when all checks are done, set global group result
                        if (group.checkCounter === checks.length) {
                            setGroupGlobalResultType(group);
                            group.loading = false;
                        }
                    });
                });
            }
            function openGroup(group) {
                vm.selectedGroup = group;
                vm.viewState = 'details';
            }
            function setViewState(state) {
                vm.viewState = state;
                if (state === 'list') {
                    for (var i = 0; i < vm.groups.length; i++) {
                        var group = vm.groups[i];
                        setGroupGlobalResultType(group);
                    }
                }
            }
        }
        angular.module('umbraco').controller('Umbraco.Dashboard.HealthCheckController', HealthCheckController);
    }());
    (function () {
        'use strict';
        function RedirectUrlsController($scope, redirectUrlsResource, notificationsService, localizationService, $q) {
            //...todo
            //search by url or url part
            //search by domain
            //display domain in dashboard results?
            //used to cancel any request in progress if another one needs to take it's place
            var vm = this;
            var canceler = null;
            vm.dashboard = {
                searchTerm: '',
                loading: false,
                urlTrackerDisabled: false,
                userIsAdmin: false
            };
            vm.pagination = {
                pageIndex: 0,
                pageNumber: 1,
                totalPages: 1,
                pageSize: 20
            };
            vm.goToPage = goToPage;
            vm.search = search;
            vm.removeRedirect = removeRedirect;
            vm.disableUrlTracker = disableUrlTracker;
            vm.enableUrlTracker = enableUrlTracker;
            vm.filter = filter;
            vm.checkEnabled = checkEnabled;
            function activate() {
                vm.checkEnabled().then(function () {
                    vm.search();
                });
            }
            function checkEnabled() {
                vm.dashboard.loading = true;
                return redirectUrlsResource.getEnableState().then(function (response) {
                    vm.dashboard.urlTrackerDisabled = response.enabled !== true;
                    vm.dashboard.userIsAdmin = response.userIsAdmin;
                    vm.dashboard.loading = false;
                });
            }
            function goToPage(pageNumber) {
                vm.pagination.pageIndex = pageNumber - 1;
                vm.pagination.pageNumber = pageNumber;
                vm.search();
            }
            function search() {
                vm.dashboard.loading = true;
                var searchTerm = vm.dashboard.searchTerm;
                if (searchTerm === undefined) {
                    searchTerm = '';
                }
                redirectUrlsResource.searchRedirectUrls(searchTerm, vm.pagination.pageIndex, vm.pagination.pageSize).then(function (response) {
                    vm.redirectUrls = response.searchResults;
                    // update pagination
                    vm.pagination.pageIndex = response.currentPage;
                    vm.pagination.pageNumber = response.currentPage + 1;
                    vm.pagination.totalPages = response.pageCount;
                    vm.dashboard.loading = false;
                });
            }
            function removeRedirect(redirectToDelete) {
                localizationService.localize('redirectUrls_confirmRemove', [
                    redirectToDelete.originalUrl,
                    redirectToDelete.destinationUrl
                ]).then(function (value) {
                    var toggleConfirm = confirm(value);
                    if (toggleConfirm) {
                        redirectUrlsResource.deleteRedirectUrl(redirectToDelete.redirectId).then(function () {
                            var index = vm.redirectUrls.indexOf(redirectToDelete);
                            vm.redirectUrls.splice(index, 1);
                            notificationsService.success(localizationService.localize('redirectUrls_redirectRemoved'));
                            // check if new redirects needs to be loaded
                            if (vm.redirectUrls.length === 0 && vm.pagination.totalPages > 1) {
                                // if we are not on the first page - get records from the previous
                                if (vm.pagination.pageIndex > 0) {
                                    vm.pagination.pageIndex = vm.pagination.pageIndex - 1;
                                    vm.pagination.pageNumber = vm.pagination.pageNumber - 1;
                                }
                                search();
                            }
                        }, function (error) {
                            notificationsService.error(localizationService.localize('redirectUrls_redirectRemoveError'));
                        });
                    }
                });
            }
            function disableUrlTracker() {
                localizationService.localize('redirectUrls_confirmDisable').then(function (value) {
                    var toggleConfirm = confirm(value);
                    if (toggleConfirm) {
                        redirectUrlsResource.toggleUrlTracker(true).then(function () {
                            activate();
                            notificationsService.success(localizationService.localize('redirectUrls_disabledConfirm'));
                        }, function (error) {
                            notificationsService.warning(localizationService.localize('redirectUrls_disableError'));
                        });
                    }
                });
            }
            function enableUrlTracker() {
                redirectUrlsResource.toggleUrlTracker(false).then(function () {
                    activate();
                    notificationsService.success(localizationService.localize('redirectUrls_enabledConfirm'));
                }, function (error) {
                    notificationsService.warning(localizationService.localize('redirectUrls_enableError'));
                });
            }
            var filterDebounced = _.debounce(function (e) {
                $scope.$apply(function () {
                    //a canceler exists, so perform the cancelation operation and reset
                    if (canceler) {
                        canceler.resolve();
                        canceler = $q.defer();
                    } else {
                        canceler = $q.defer();
                    }
                    vm.search();
                });
            }, 200);
            function filter() {
                vm.dashboard.loading = true;
                filterDebounced();
            }
            activate();
        }
        angular.module('umbraco').controller('Umbraco.Dashboard.RedirectUrlsController', RedirectUrlsController);
    }());
    function XmlDataIntegrityReportController($scope, umbRequestHelper, $log, $http) {
        function check(item) {
            var action = item.check;
            umbRequestHelper.resourcePromise($http.get(umbRequestHelper.getApiUrl('xmlDataIntegrityBaseUrl', action)), 'Failed to retrieve data integrity status').then(function (result) {
                item.checking = false;
                item.invalid = result === 'false';
            });
        }
        $scope.fix = function (item) {
            var action = item.fix;
            if (item.fix) {
                if (confirm('This will cause all xml structures for this type to be rebuilt. ' + 'Depending on how much content there is in your site this could take a while. ' + 'It is not recommended to rebuild xml structures if they are not out of sync, during times of high website traffic ' + 'or when editors are editing content.')) {
                    item.fixing = true;
                    umbRequestHelper.resourcePromise($http.post(umbRequestHelper.getApiUrl('xmlDataIntegrityBaseUrl', action)), 'Failed to retrieve data integrity status').then(function (result) {
                        item.fixing = false;
                        item.invalid = result === 'false';
                    });
                }
            }
        };
        $scope.items = {
            'contentXml': {
                label: 'Content in the cmsContentXml table',
                checking: true,
                fixing: false,
                fix: 'FixContentXmlTable',
                check: 'CheckContentXmlTable'
            },
            'mediaXml': {
                label: 'Media in the cmsContentXml table',
                checking: true,
                fixing: false,
                fix: 'FixMediaXmlTable',
                check: 'CheckMediaXmlTable'
            },
            'memberXml': {
                label: 'Members in the cmsContentXml table',
                checking: true,
                fixing: false,
                fix: 'FixMembersXmlTable',
                check: 'CheckMembersXmlTable'
            }
        };
        for (var i in $scope.items) {
            check($scope.items[i]);
        }
    }
    angular.module('umbraco').controller('Umbraco.Dashboard.XmlDataIntegrityReportController', XmlDataIntegrityReportController);
    /**
 * @ngdoc controller
 * @name Umbraco.Editors.DataType.CreateController
 * @function
 *
 * @description
 * The controller for the data type creation dialog
 */
    function DataTypeCreateController($scope, $location, navigationService, dataTypeResource, formHelper, appState) {
        $scope.model = {
            folderName: '',
            creatingFolder: false
        };
        var node = $scope.dialogOptions.currentNode;
        $scope.showCreateFolder = function () {
            $scope.model.creatingFolder = true;
        };
        $scope.createContainer = function () {
            if (formHelper.submitForm({
                    scope: $scope,
                    formCtrl: this.createFolderForm,
                    statusMessage: 'Creating folder...'
                })) {
                dataTypeResource.createContainer(node.id, $scope.model.folderName).then(function (folderId) {
                    navigationService.hideMenu();
                    var currPath = node.path ? node.path : '-1';
                    navigationService.syncTree({
                        tree: 'datatypes',
                        path: currPath + ',' + folderId,
                        forceReload: true,
                        activate: true
                    });
                    formHelper.resetForm({ scope: $scope });
                    var section = appState.getSectionState('currentSection');
                }, function (err) {
                });
            }
            ;
        };
        $scope.createDataType = function () {
            $location.search('create', null);
            $location.path('/developer/datatypes/edit/' + node.id).search('create', 'true');
            navigationService.hideMenu();
        };
    }
    angular.module('umbraco').controller('Umbraco.Editors.DataType.CreateController', DataTypeCreateController);
    /**
 * @ngdoc controller
 * @name Umbraco.Editors.ContentDeleteController
 * @function
 * 
 * @description
 * The controller for deleting content
 */
    function DataTypeDeleteController($scope, dataTypeResource, treeService, navigationService) {
        $scope.performDelete = function () {
            //mark it for deletion (used in the UI)
            $scope.currentNode.loading = true;
            dataTypeResource.deleteById($scope.currentNode.id).then(function () {
                $scope.currentNode.loading = false;
                //get the root node before we remove it
                var rootNode = treeService.getTreeRoot($scope.currentNode);
                //TODO: Need to sync tree, etc...
                treeService.removeNode($scope.currentNode);
                navigationService.hideMenu();
            });
        };
        $scope.performContainerDelete = function () {
            //mark it for deletion (used in the UI)
            $scope.currentNode.loading = true;
            dataTypeResource.deleteContainerById($scope.currentNode.id).then(function () {
                $scope.currentNode.loading = false;
                //get the root node before we remove it
                var rootNode = treeService.getTreeRoot($scope.currentNode);
                //TODO: Need to sync tree, etc...
                treeService.removeNode($scope.currentNode);
                navigationService.hideMenu();
            });
        };
        $scope.cancel = function () {
            navigationService.hideDialog();
        };
    }
    angular.module('umbraco').controller('Umbraco.Editors.DataType.DeleteController', DataTypeDeleteController);
    /**
 * @ngdoc controller
 * @name Umbraco.Editors.DataType.EditController
 * @function
 *
 * @description
 * The controller for the content editor
 */
    function DataTypeEditController($scope, $routeParams, $location, appState, navigationService, treeService, dataTypeResource, notificationsService, angularHelper, serverValidationManager, contentEditingHelper, formHelper, editorState, dataTypeHelper, eventsService) {
        //setup scope vars
        $scope.page = {};
        $scope.page.loading = false;
        $scope.page.nameLocked = false;
        $scope.page.menu = {};
        $scope.page.menu.currentSection = appState.getSectionState('currentSection');
        $scope.page.menu.currentNode = null;
        var evts = [];
        //method used to configure the pre-values when we retrieve them from the server
        function createPreValueProps(preVals) {
            $scope.preValues = [];
            for (var i = 0; i < preVals.length; i++) {
                $scope.preValues.push({
                    hideLabel: preVals[i].hideLabel,
                    alias: preVals[i].key,
                    description: preVals[i].description,
                    label: preVals[i].label,
                    view: preVals[i].view,
                    value: preVals[i].value,
                    config: preVals[i].config
                });
            }
        }
        //set up the standard data type props
        $scope.properties = {
            selectedEditor: {
                alias: 'selectedEditor',
                description: 'Select a property editor',
                label: 'Property editor'
            },
            selectedEditorId: {
                alias: 'selectedEditorId',
                label: 'Property editor alias'
            }
        };
        //setup the pre-values as props
        $scope.preValues = [];
        if ($routeParams.create) {
            $scope.page.loading = true;
            $scope.showIdentifier = false;
            //we are creating so get an empty data type item
            dataTypeResource.getScaffold($routeParams.id).then(function (data) {
                $scope.preValuesLoaded = true;
                $scope.content = data;
                setHeaderNameState($scope.content);
                //set a shared state
                editorState.set($scope.content);
                $scope.page.loading = false;
            });
        } else {
            loadDataType();
        }
        function loadDataType() {
            $scope.page.loading = true;
            $scope.showIdentifier = true;
            //we are editing so get the content item from the server
            dataTypeResource.getById($routeParams.id).then(function (data) {
                $scope.preValuesLoaded = true;
                $scope.content = data;
                createPreValueProps($scope.content.preValues);
                setHeaderNameState($scope.content);
                //share state
                editorState.set($scope.content);
                //in one particular special case, after we've created a new item we redirect back to the edit
                // route but there might be server validation errors in the collection which we need to display
                // after the redirect, so we will bind all subscriptions which will show the server validation errors
                // if there are any and then clear them so the collection no longer persists them.
                serverValidationManager.executeAndClearAllSubscriptions();
                navigationService.syncTree({
                    tree: 'datatypes',
                    path: data.path
                }).then(function (syncArgs) {
                    $scope.page.menu.currentNode = syncArgs.node;
                });
                $scope.page.loading = false;
            });
        }
        $scope.$watch('content.selectedEditor', function (newVal, oldVal) {
            //when the value changes, we need to dynamically load in the new editor
            if (newVal && (newVal != oldVal && (oldVal || $routeParams.create))) {
                //we are editing so get the content item from the server
                var currDataTypeId = $routeParams.create ? undefined : $routeParams.id;
                dataTypeResource.getPreValues(newVal, currDataTypeId).then(function (data) {
                    $scope.preValuesLoaded = true;
                    $scope.content.preValues = data;
                    createPreValueProps($scope.content.preValues);
                    setHeaderNameState($scope.content);
                    //share state
                    editorState.set($scope.content);
                });
            }
        });
        function setHeaderNameState(content) {
            if (content.isSystem == 1) {
                $scope.page.nameLocked = true;
            }
        }
        $scope.save = function () {
            if (formHelper.submitForm({
                    scope: $scope,
                    statusMessage: 'Saving...'
                })) {
                $scope.page.saveButtonState = 'busy';
                dataTypeResource.save($scope.content, $scope.preValues, $routeParams.create).then(function (data) {
                    formHelper.resetForm({
                        scope: $scope,
                        notifications: data.notifications
                    });
                    contentEditingHelper.handleSuccessfulSave({
                        scope: $scope,
                        savedContent: data,
                        rebindCallback: function () {
                            createPreValueProps(data.preValues);
                        }
                    });
                    setHeaderNameState($scope.content);
                    //share state
                    editorState.set($scope.content);
                    navigationService.syncTree({
                        tree: 'datatypes',
                        path: data.path,
                        forceReload: true
                    }).then(function (syncArgs) {
                        $scope.page.menu.currentNode = syncArgs.node;
                    });
                    $scope.page.saveButtonState = 'success';
                    dataTypeHelper.rebindChangedProperties($scope.content, data);
                }, function (err) {
                    //NOTE: in the case of data type values we are setting the orig/new props
                    // to be the same thing since that only really matters for content/media.
                    contentEditingHelper.handleSaveError({
                        redirectOnFailure: false,
                        err: err
                    });
                    $scope.page.saveButtonState = 'error';
                    //share state
                    editorState.set($scope.content);
                });
            }
        };
        evts.push(eventsService.on('app.refreshEditor', function (name, error) {
            loadDataType();
        }));
        //ensure to unregister from all events!
        $scope.$on('$destroy', function () {
            for (var e in evts) {
                eventsService.unsubscribe(evts[e]);
            }
        });
    }
    angular.module('umbraco').controller('Umbraco.Editors.DataType.EditController', DataTypeEditController);
    angular.module('umbraco').controller('Umbraco.Editors.DataType.MoveController', function ($scope, dataTypeResource, treeService, navigationService, notificationsService, appState, eventsService) {
        var dialogOptions = $scope.dialogOptions;
        $scope.dialogTreeEventHandler = $({});
        function nodeSelectHandler(ev, args) {
            args.event.preventDefault();
            args.event.stopPropagation();
            if ($scope.target) {
                //un-select if there's a current one selected
                $scope.target.selected = false;
            }
            $scope.target = args.node;
            $scope.target.selected = true;
        }
        $scope.move = function () {
            $scope.busy = true;
            $scope.error = false;
            dataTypeResource.move({
                parentId: $scope.target.id,
                id: dialogOptions.currentNode.id
            }).then(function (path) {
                $scope.error = false;
                $scope.success = true;
                $scope.busy = false;
                //first we need to remove the node that launched the dialog
                treeService.removeNode($scope.currentNode);
                //get the currently edited node (if any)
                var activeNode = appState.getTreeState('selectedNode');
                //we need to do a double sync here: first sync to the moved content - but don't activate the node,
                //then sync to the currenlty edited content (note: this might not be the content that was moved!!)
                navigationService.syncTree({
                    tree: 'dataTypes',
                    path: path,
                    forceReload: true,
                    activate: false
                }).then(function (args) {
                    if (activeNode) {
                        var activeNodePath = treeService.getPath(activeNode).join();
                        //sync to this node now - depending on what was copied this might already be synced but might not be
                        navigationService.syncTree({
                            tree: 'dataTypes',
                            path: activeNodePath,
                            forceReload: false,
                            activate: true
                        });
                    }
                });
                eventsService.emit('app.refreshEditor');
            }, function (err) {
                $scope.success = false;
                $scope.error = err;
                $scope.busy = false;
                //show any notifications
                if (angular.isArray(err.data.notifications)) {
                    for (var i = 0; i < err.data.notifications.length; i++) {
                        notificationsService.showNotification(err.data.notifications[i]);
                    }
                }
            });
        };
        $scope.dialogTreeEventHandler.bind('treeNodeSelect', nodeSelectHandler);
        $scope.$on('$destroy', function () {
            $scope.dialogTreeEventHandler.unbind('treeNodeSelect', nodeSelectHandler);
        });
    });
    /**
 * @ngdoc controller
 * @name Umbraco.Editors.Dictionary.CreateController
 * @function
 * 
 * @description
 * The controller for creating dictionary items
 */
    function DictionaryCreateController($scope, $location, dictionaryResource, navigationService, notificationsService, formHelper, appState) {
        var vm = this;
        vm.itemKey = '';
        function createItem() {
            var node = $scope.dialogOptions.currentNode;
            dictionaryResource.create(node.id, vm.itemKey).then(function (data) {
                navigationService.hideMenu();
                // set new item as active in tree
                var currPath = node.path ? node.path : '-1';
                navigationService.syncTree({
                    tree: 'dictionary',
                    path: currPath + ',' + data,
                    forceReload: true,
                    activate: true
                });
                // reset form state
                formHelper.resetForm({ scope: $scope });
                // navigate to edit view
                var currentSection = appState.getSectionState('currentSection');
                $location.path('/' + currentSection + '/dictionary/edit/' + data);
            }, function (err) {
                if (err.data && err.data.message) {
                    notificationsService.error(err.data.message);
                    navigationService.hideMenu();
                }
            });
        }
        vm.createItem = createItem;
    }
    angular.module('umbraco').controller('Umbraco.Editors.Dictionary.CreateController', DictionaryCreateController);
    /**
 * @ngdoc controller
 * @name Umbraco.Editors.Dictionary.DeleteController
 * @function
 * 
 * @description
 * The controller for deleting dictionary items
 */
    function DictionaryDeleteController($scope, $location, dictionaryResource, treeService, navigationService, appState) {
        var vm = this;
        function cancel() {
            navigationService.hideDialog();
        }
        function performDelete() {
            // stop from firing again on double-click
            if ($scope.busy) {
                return false;
            }
            //mark it for deletion (used in the UI)
            $scope.currentNode.loading = true;
            $scope.busy = true;
            dictionaryResource.deleteById($scope.currentNode.id).then(function () {
                $scope.currentNode.loading = false;
                // get the parent id 
                var parentId = $scope.currentNode.parentId;
                treeService.removeNode($scope.currentNode);
                navigationService.hideMenu();
                var currentSection = appState.getSectionState('currentSection');
                if (parentId !== '-1') {
                    // set the view of the parent item
                    $location.path('/' + currentSection + '/dictionary/edit/' + parentId);
                } else {
                    // we have no parent, so redirect to section
                    $location.path('/' + currentSection + '/');
                }
            });
        }
        vm.cancel = cancel;
        vm.performDelete = performDelete;
    }
    angular.module('umbraco').controller('Umbraco.Editors.Dictionary.DeleteController', DictionaryDeleteController);
    /**
 * @ngdoc controller
 * @name Umbraco.Editors.Dictionary.EditController
 * @function
 * 
 * @description
 * The controller for editing dictionary items
 */
    function DictionaryEditController($scope, $routeParams, dictionaryResource, treeService, navigationService, appState, editorState, contentEditingHelper, formHelper, notificationsService, localizationService) {
        var vm = this;
        //setup scope vars
        vm.nameDirty = false;
        vm.page = {};
        vm.page.loading = false;
        vm.page.nameLocked = false;
        vm.page.menu = {};
        vm.page.menu.currentSection = appState.getSectionState('currentSection');
        vm.page.menu.currentNode = null;
        vm.description = '';
        function loadDictionary() {
            vm.page.loading = true;
            //we are editing so get the content item from the server
            dictionaryResource.getById($routeParams.id).then(function (data) {
                bindDictionary(data);
                vm.page.loading = false;
            });
        }
        function createTranslationProperty(translation) {
            return {
                alias: translation.isoCode,
                label: translation.displayName,
                hideLabel: false
            };
        }
        function bindDictionary(data) {
            localizationService.localize('dictionaryItem_description').then(function (value) {
                vm.description = value.replace('%0%', data.name);
            });
            // create data for  umb-property displaying
            for (var i = 0; i < data.translations.length; i++) {
                data.translations[i].property = createTranslationProperty(data.translations[i]);
            }
            contentEditingHelper.handleSuccessfulSave({
                scope: $scope,
                savedContent: data
            });
            // set content
            vm.content = data;
            //share state
            editorState.set(vm.content);
            navigationService.syncTree({
                tree: 'dictionary',
                path: data.path,
                forceReload: true
            }).then(function (syncArgs) {
                vm.page.menu.currentNode = syncArgs.node;
            });
        }
        function onInit() {
            loadDictionary();
        }
        function saveDictionary() {
            if (formHelper.submitForm({
                    scope: $scope,
                    statusMessage: 'Saving...'
                })) {
                vm.page.saveButtonState = 'busy';
                dictionaryResource.save(vm.content, vm.nameDirty).then(function (data) {
                    formHelper.resetForm({
                        scope: $scope,
                        notifications: data.notifications
                    });
                    bindDictionary(data);
                    vm.page.saveButtonState = 'success';
                }, function (err) {
                    contentEditingHelper.handleSaveError({
                        redirectOnFailure: false,
                        err: err
                    });
                    notificationsService.error(err.data.message);
                    vm.page.saveButtonState = 'error';
                });
            }
        }
        vm.save = saveDictionary;
        $scope.$watch('vm.content.name', function (newVal, oldVal) {
            //when the value changes, we need to set the name dirty
            if (newVal && newVal !== oldVal && typeof oldVal !== 'undefined') {
                vm.nameDirty = true;
            }
        });
        onInit();
    }
    angular.module('umbraco').controller('Umbraco.Editors.Dictionary.EditController', DictionaryEditController);
    /**
 * @ngdoc controller
 * @name Umbraco.Editors.Dictionary.ListController
 * @function
 * 
 * @description
 * The controller for listting dictionary items
 */
    function DictionaryListController($scope, $location, dictionaryResource, localizationService, appState) {
        var vm = this;
        vm.title = 'Dictionary overview';
        vm.loading = false;
        vm.items = [];
        function loadList() {
            vm.loading = true;
            dictionaryResource.getList().then(function (data) {
                vm.items = data;
                vm.loading = false;
            });
        }
        function clickItem(id) {
            var currentSection = appState.getSectionState('currentSection');
            $location.path('/' + currentSection + '/dictionary/edit/' + id);
        }
        vm.clickItem = clickItem;
        function onInit() {
            localizationService.localize('dictionaryItem_overviewTitle').then(function (value) {
                vm.title = value;
            });
            loadList();
        }
        onInit();
    }
    angular.module('umbraco').controller('Umbraco.Editors.Dictionary.ListController', DictionaryListController);
    angular.module('umbraco').controller('Umbraco.Editors.DocumentTypes.CopyController', function ($scope, contentTypeResource, treeService, navigationService, notificationsService, appState, eventsService) {
        var dialogOptions = $scope.dialogOptions;
        $scope.dialogTreeEventHandler = $({});
        function nodeSelectHandler(ev, args) {
            args.event.preventDefault();
            args.event.stopPropagation();
            if ($scope.target) {
                //un-select if there's a current one selected
                $scope.target.selected = false;
            }
            $scope.target = args.node;
            $scope.target.selected = true;
        }
        $scope.copy = function () {
            $scope.busy = true;
            $scope.error = false;
            contentTypeResource.copy({
                parentId: $scope.target.id,
                id: dialogOptions.currentNode.id
            }).then(function (path) {
                $scope.error = false;
                $scope.success = true;
                $scope.busy = false;
                //get the currently edited node (if any)
                var activeNode = appState.getTreeState('selectedNode');
                //we need to do a double sync here: first sync to the copied content - but don't activate the node,
                //then sync to the currenlty edited content (note: this might not be the content that was copied!!)
                navigationService.syncTree({
                    tree: 'documentTypes',
                    path: path,
                    forceReload: true,
                    activate: false
                }).then(function (args) {
                    if (activeNode) {
                        var activeNodePath = treeService.getPath(activeNode).join();
                        //sync to this node now - depending on what was copied this might already be synced but might not be
                        navigationService.syncTree({
                            tree: 'documentTypes',
                            path: activeNodePath,
                            forceReload: false,
                            activate: true
                        });
                    }
                });
            }, function (err) {
                $scope.success = false;
                $scope.error = err;
                $scope.busy = false;
                //show any notifications
                if (angular.isArray(err.data.notifications)) {
                    for (var i = 0; i < err.data.notifications.length; i++) {
                        notificationsService.showNotification(err.data.notifications[i]);
                    }
                }
            });
        };
        $scope.dialogTreeEventHandler.bind('treeNodeSelect', nodeSelectHandler);
        $scope.$on('$destroy', function () {
            $scope.dialogTreeEventHandler.unbind('treeNodeSelect', nodeSelectHandler);
        });
    });
    /**
 * @ngdoc controller
 * @name Umbraco.Editors.DocumentType.CreateController
 * @function
 *
 * @description
 * The controller for the doc type creation dialog
 */
    function DocumentTypesCreateController($scope, $location, navigationService, contentTypeResource, formHelper, appState, notificationsService, localizationService, iconHelper) {
        $scope.model = {
            allowCreateFolder: $scope.dialogOptions.currentNode.parentId === null || $scope.dialogOptions.currentNode.nodeType === 'container',
            folderName: '',
            creatingFolder: false,
            creatingDoctypeCollection: false
        };
        var disableTemplates = Umbraco.Sys.ServerVariables.features.disabledFeatures.disableTemplates;
        $scope.model.disableTemplates = disableTemplates;
        var node = $scope.dialogOptions.currentNode, localizeCreateFolder = localizationService.localize('defaultdialog_createFolder');
        $scope.showCreateFolder = function () {
            $scope.model.creatingFolder = true;
        };
        $scope.showCreateDocTypeCollection = function () {
            $scope.model.creatingDoctypeCollection = true;
            $scope.model.collectionCreateTemplate = !$scope.model.disableTemplates;
            $scope.model.collectionItemCreateTemplate = !$scope.model.disableTemplates;
        };
        $scope.createContainer = function () {
            if (formHelper.submitForm({
                    scope: $scope,
                    formCtrl: this.createFolderForm,
                    statusMessage: localizeCreateFolder
                })) {
                contentTypeResource.createContainer(node.id, $scope.model.folderName).then(function (folderId) {
                    navigationService.hideMenu();
                    var currPath = node.path ? node.path : '-1';
                    navigationService.syncTree({
                        tree: 'documenttypes',
                        path: currPath + ',' + folderId,
                        forceReload: true,
                        activate: true
                    });
                    formHelper.resetForm({ scope: $scope });
                    var section = appState.getSectionState('currentSection');
                }, function (err) {
                    $scope.error = err;
                    //show any notifications
                    if (angular.isArray(err.data.notifications)) {
                        for (var i = 0; i < err.data.notifications.length; i++) {
                            notificationsService.showNotification(err.data.notifications[i]);
                        }
                    }
                });
            }
        };
        $scope.createCollection = function () {
            if (formHelper.submitForm({
                    scope: $scope,
                    formCtrl: this.createDoctypeCollectionForm,
                    statusMessage: 'Creating Doctype Collection...'
                })) {
                // see if we can find matching icons
                var collectionIcon = 'icon-folders', collectionItemIcon = 'icon-document';
                iconHelper.getIcons().then(function (icons) {
                    for (var i = 0; i < icons.length; i++) {
                        // for matching we'll require a full match for collection, partial match for item
                        if (icons[i].substring(5) == $scope.model.collectionName.toLowerCase()) {
                            collectionIcon = icons[i];
                        } else if (icons[i].substring(5).indexOf($scope.model.collectionItemName.toLowerCase()) > -1) {
                            collectionItemIcon = icons[i];
                        }
                    }
                    contentTypeResource.createCollection(node.id, $scope.model.collectionName, $scope.model.collectionCreateTemplate, $scope.model.collectionItemName, $scope.model.collectionItemCreateTemplate, collectionIcon, collectionItemIcon).then(function (collectionData) {
                        navigationService.hideMenu();
                        $location.search('create', null);
                        $location.search('notemplate', null);
                        formHelper.resetForm({ scope: $scope });
                        var section = appState.getSectionState('currentSection');
                        // redirect to the item id
                        $location.path('/settings/documenttypes/edit/' + collectionData.ItemId);
                    }, function (err) {
                        $scope.error = err;
                        //show any notifications
                        if (angular.isArray(err.data.notifications)) {
                            for (var i = 0; i < err.data.notifications.length; i++) {
                                notificationsService.showNotification(err.data.notifications[i]);
                            }
                        }
                    });
                });
            }
        };
        // Disabling logic for creating document type with template if disableTemplates is set to true
        if (!disableTemplates) {
            $scope.createDocType = function () {
                $location.search('create', null);
                $location.search('notemplate', null);
                $location.path('/settings/documenttypes/edit/' + node.id).search('create', 'true');
                navigationService.hideMenu();
            };
        }
        $scope.createComponent = function () {
            $location.search('create', null);
            $location.search('notemplate', null);
            $location.path('/settings/documenttypes/edit/' + node.id).search('create', 'true').search('notemplate', 'true');
            navigationService.hideMenu();
        };
    }
    angular.module('umbraco').controller('Umbraco.Editors.DocumentTypes.CreateController', DocumentTypesCreateController);
    /**
 * @ngdoc controller
 * @name Umbraco.Editors.DocumentType.DeleteController
 * @function
 *
 * @description
 * The controller for deleting content
 */
    function DocumentTypesDeleteController($scope, dataTypeResource, contentTypeResource, treeService, navigationService) {
        $scope.performDelete = function () {
            //mark it for deletion (used in the UI)
            $scope.currentNode.loading = true;
            contentTypeResource.deleteById($scope.currentNode.id).then(function () {
                $scope.currentNode.loading = false;
                //get the root node before we remove it
                var rootNode = treeService.getTreeRoot($scope.currentNode);
                //TODO: Need to sync tree, etc...
                treeService.removeNode($scope.currentNode);
                navigationService.hideMenu();
            });
        };
        $scope.performContainerDelete = function () {
            //mark it for deletion (used in the UI)
            $scope.currentNode.loading = true;
            contentTypeResource.deleteContainerById($scope.currentNode.id).then(function () {
                $scope.currentNode.loading = false;
                //get the root node before we remove it
                var rootNode = treeService.getTreeRoot($scope.currentNode);
                //TODO: Need to sync tree, etc...
                treeService.removeNode($scope.currentNode);
                navigationService.hideMenu();
            });
        };
        $scope.cancel = function () {
            navigationService.hideDialog();
        };
    }
    angular.module('umbraco').controller('Umbraco.Editors.DocumentTypes.DeleteController', DocumentTypesDeleteController);
    /**
 * @ngdoc controller
 * @name Umbraco.Editors.DocumentType.EditController
 * @function
 *
 * @description
 * The controller for the content type editor
 */
    (function () {
        'use strict';
        function DocumentTypesEditController($scope, $routeParams, $injector, contentTypeResource, dataTypeResource, editorState, contentEditingHelper, formHelper, navigationService, iconHelper, contentTypeHelper, notificationsService, $filter, $q, localizationService, overlayHelper, eventsService, angularHelper) {
            var vm = this;
            var localizeSaving = localizationService.localize('general_saving');
            var evts = [];
            var disableTemplates = Umbraco.Sys.ServerVariables.features.disabledFeatures.disableTemplates;
            var buttons = [
                {
                    'name': localizationService.localize('general_design'),
                    'alias': 'design',
                    'icon': 'icon-document-dashed-line',
                    'view': 'views/documenttypes/views/design/design.html',
                    'active': true
                },
                {
                    'name': localizationService.localize('general_listView'),
                    'alias': 'listView',
                    'icon': 'icon-list',
                    'view': 'views/documenttypes/views/listview/listview.html'
                },
                {
                    'name': localizationService.localize('general_rights'),
                    'alias': 'permissions',
                    'icon': 'icon-keychain',
                    'view': 'views/documenttypes/views/permissions/permissions.html'
                },
                {
                    'name': localizationService.localize('treeHeaders_templates'),
                    'alias': 'templates',
                    'icon': 'icon-layout',
                    'view': 'views/documenttypes/views/templates/templates.html'
                }
            ];
            vm.save = save;
            vm.currentNode = null;
            vm.contentType = {};
            vm.page = {};
            vm.page.loading = false;
            vm.page.saveButtonState = 'init';
            vm.page.navigation = [];
            loadButtons();
            vm.page.keyboardShortcutsOverview = [
                {
                    'name': localizationService.localize('main_sections'),
                    'shortcuts': [{
                            'description': localizationService.localize('shortcuts_navigateSections'),
                            'keys': [
                                { 'key': '1' },
                                { 'key': '4' }
                            ],
                            'keyRange': true
                        }]
                },
                {
                    'name': localizationService.localize('general_design'),
                    'shortcuts': [
                        {
                            'description': localizationService.localize('shortcuts_addTab'),
                            'keys': [
                                { 'key': 'alt' },
                                { 'key': 'shift' },
                                { 'key': 't' }
                            ]
                        },
                        {
                            'description': localizationService.localize('shortcuts_addProperty'),
                            'keys': [
                                { 'key': 'alt' },
                                { 'key': 'shift' },
                                { 'key': 'p' }
                            ]
                        },
                        {
                            'description': localizationService.localize('shortcuts_addEditor'),
                            'keys': [
                                { 'key': 'alt' },
                                { 'key': 'shift' },
                                { 'key': 'e' }
                            ]
                        },
                        {
                            'description': localizationService.localize('shortcuts_editDataType'),
                            'keys': [
                                { 'key': 'alt' },
                                { 'key': 'shift' },
                                { 'key': 'd' }
                            ]
                        }
                    ]
                },
                {
                    'name': localizationService.localize('general_listView'),
                    'shortcuts': [{
                            'description': localizationService.localize('shortcuts_toggleListView'),
                            'keys': [
                                { 'key': 'alt' },
                                { 'key': 'shift' },
                                { 'key': 'l' }
                            ]
                        }]
                },
                {
                    'name': localizationService.localize('general_rights'),
                    'shortcuts': [
                        {
                            'description': localizationService.localize('shortcuts_toggleAllowAsRoot'),
                            'keys': [
                                { 'key': 'alt' },
                                { 'key': 'shift' },
                                { 'key': 'r' }
                            ]
                        },
                        {
                            'description': localizationService.localize('shortcuts_addChildNode'),
                            'keys': [
                                { 'key': 'alt' },
                                { 'key': 'shift' },
                                { 'key': 'c' }
                            ]
                        }
                    ]
                },
                {
                    'name': localizationService.localize('treeHeaders_templates'),
                    'shortcuts': [{
                            'description': localizationService.localize('shortcuts_addTemplate'),
                            'keys': [
                                { 'key': 'alt' },
                                { 'key': 'shift' },
                                { 'key': 't' }
                            ]
                        }]
                }
            ];
            contentTypeHelper.checkModelsBuilderStatus().then(function (result) {
                vm.page.modelsBuilder = result;
                if (result) {
                    //Models builder mode:
                    vm.page.defaultButton = {
                        alias: 'save',
                        hotKey: 'ctrl+s',
                        hotKeyWhenHidden: true,
                        labelKey: 'buttons_save',
                        letter: 'S',
                        type: 'submit',
                        handler: function () {
                            vm.save();
                        }
                    };
                    vm.page.subButtons = [{
                            alias: 'saveAndGenerateModels',
                            hotKey: 'ctrl+g',
                            hotKeyWhenHidden: true,
                            labelKey: 'buttons_saveAndGenerateModels',
                            letter: 'G',
                            handler: function () {
                                vm.page.saveButtonState = 'busy';
                                vm.save().then(function (result) {
                                    vm.page.saveButtonState = 'busy';
                                    localizationService.localize('modelsBuilder_buildingModels').then(function (headerValue) {
                                        localizationService.localize('modelsBuilder_waitingMessage').then(function (msgValue) {
                                            notificationsService.info(headerValue, msgValue);
                                        });
                                    });
                                    contentTypeHelper.generateModels().then(function (result) {
                                        // generateModels() returns the dashboard content
                                        if (!result.lastError) {
                                            //re-check model status
                                            contentTypeHelper.checkModelsBuilderStatus().then(function (statusResult) {
                                                vm.page.modelsBuilder = statusResult;
                                            });
                                            //clear and add success
                                            vm.page.saveButtonState = 'init';
                                            localizationService.localize('modelsBuilder_modelsGenerated').then(function (value) {
                                                notificationsService.success(value);
                                            });
                                        } else {
                                            vm.page.saveButtonState = 'error';
                                            localizationService.localize('modelsBuilder_modelsExceptionInUlog').then(function (value) {
                                                notificationsService.error(value);
                                            });
                                        }
                                    }, function () {
                                        vm.page.saveButtonState = 'error';
                                        localizationService.localize('modelsBuilder_modelsGeneratedError').then(function (value) {
                                            notificationsService.error(value);
                                        });
                                    });
                                });
                            }
                        }];
                }
            });
            if ($routeParams.create) {
                vm.page.loading = true;
                //we are creating so get an empty data type item
                contentTypeResource.getScaffold($routeParams.id).then(function (dt) {
                    init(dt);
                    vm.page.loading = false;
                });
            } else {
                loadDocumentType();
            }
            function loadDocumentType() {
                vm.page.loading = true;
                contentTypeResource.getById($routeParams.id).then(function (dt) {
                    init(dt);
                    syncTreeNode(vm.contentType, dt.path, true);
                    vm.page.loading = false;
                });
            }
            function loadButtons() {
                angular.forEach(buttons, function (val, index) {
                    if (disableTemplates === true && val.alias === 'templates') {
                        buttons.splice(index, 1);
                    }
                });
                vm.page.navigation = buttons;
            }
            /* ---------- SAVE ---------- */
            function save() {
                // only save if there is no overlays open
                if (overlayHelper.getNumberOfOverlays() === 0) {
                    var deferred = $q.defer();
                    vm.page.saveButtonState = 'busy';
                    // reformat allowed content types to array if id's
                    vm.contentType.allowedContentTypes = contentTypeHelper.createIdArray(vm.contentType.allowedContentTypes);
                    contentEditingHelper.contentEditorPerformSave({
                        statusMessage: localizeSaving,
                        saveMethod: contentTypeResource.save,
                        scope: $scope,
                        content: vm.contentType,
                        //We do not redirect on failure for doc types - this is because it is not possible to actually save the doc
                        // type when server side validation fails - as opposed to content where we are capable of saving the content
                        // item if server side validation fails
                        redirectOnFailure: false,
                        // we need to rebind... the IDs that have been created!
                        rebindCallback: function (origContentType, savedContentType) {
                            vm.contentType.id = savedContentType.id;
                            vm.contentType.groups.forEach(function (group) {
                                if (!group.name)
                                    return;
                                var k = 0;
                                while (k < savedContentType.groups.length && savedContentType.groups[k].name != group.name)
                                    k++;
                                if (k == savedContentType.groups.length) {
                                    group.id = 0;
                                    return;
                                }
                                var savedGroup = savedContentType.groups[k];
                                if (!group.id)
                                    group.id = savedGroup.id;
                                group.properties.forEach(function (property) {
                                    if (property.id || !property.alias)
                                        return;
                                    k = 0;
                                    while (k < savedGroup.properties.length && savedGroup.properties[k].alias != property.alias)
                                        k++;
                                    if (k == savedGroup.properties.length) {
                                        property.id = 0;
                                        return;
                                    }
                                    var savedProperty = savedGroup.properties[k];
                                    property.id = savedProperty.id;
                                });
                            });
                        }
                    }).then(function (data) {
                        //success
                        syncTreeNode(vm.contentType, data.path);
                        vm.page.saveButtonState = 'success';
                        deferred.resolve(data);
                    }, function (err) {
                        //error
                        if (err) {
                            editorState.set($scope.content);
                        } else {
                            localizationService.localize('speechBubbles_validationFailedHeader').then(function (headerValue) {
                                localizationService.localize('speechBubbles_validationFailedMessage').then(function (msgValue) {
                                    notificationsService.error(headerValue, msgValue);
                                });
                            });
                        }
                        vm.page.saveButtonState = 'error';
                        deferred.reject(err);
                    });
                    return deferred.promise;
                }
            }
            function init(contentType) {
                // set all tab to inactive
                if (contentType.groups.length !== 0) {
                    angular.forEach(contentType.groups, function (group) {
                        angular.forEach(group.properties, function (property) {
                            // get data type details for each property
                            getDataTypeDetails(property);
                        });
                    });
                }
                // insert template on new doc types
                if (!$routeParams.notemplate && contentType.id === 0) {
                    contentType.defaultTemplate = contentTypeHelper.insertDefaultTemplatePlaceholder(contentType.defaultTemplate);
                    contentType.allowedTemplates = contentTypeHelper.insertTemplatePlaceholder(contentType.allowedTemplates);
                }
                // convert icons for content type
                convertLegacyIcons(contentType);
                //set a shared state
                editorState.set(contentType);
                vm.contentType = contentType;
            }
            function convertLegacyIcons(contentType) {
                // make array to store contentType icon
                var contentTypeArray = [];
                // push icon to array
                contentTypeArray.push({ 'icon': contentType.icon });
                // run through icon method
                iconHelper.formatContentTypeIcons(contentTypeArray);
                // set icon back on contentType
                contentType.icon = contentTypeArray[0].icon;
            }
            function getDataTypeDetails(property) {
                if (property.propertyState !== 'init') {
                    dataTypeResource.getById(property.dataTypeId).then(function (dataType) {
                        property.dataTypeIcon = dataType.icon;
                        property.dataTypeName = dataType.name;
                    });
                }
            }
            /** Syncs the content type  to it's tree node - this occurs on first load and after saving */
            function syncTreeNode(dt, path, initialLoad) {
                navigationService.syncTree({
                    tree: 'documenttypes',
                    path: path.split(','),
                    forceReload: initialLoad !== true
                }).then(function (syncArgs) {
                    vm.currentNode = syncArgs.node;
                });
            }
            evts.push(eventsService.on('app.refreshEditor', function (name, error) {
                loadDocumentType();
            }));
            //ensure to unregister from all events!
            $scope.$on('$destroy', function () {
                for (var e in evts) {
                    eventsService.unsubscribe(evts[e]);
                }
            });
            // #3368 - changes on the other "buttons" do not register on the current form, so we manually have to flag the form as dirty 
            $scope.$watch('vm.contentType.allowedContentTypes.length + vm.contentType.allowAsRoot + vm.contentType.allowedTemplates.length + vm.contentType.isContainer', function (newVal, oldVal) {
                if (oldVal === undefined) {
                    // still initializing, ignore
                    return;
                }
                angularHelper.getCurrentForm($scope).$setDirty();
            });
        }
        angular.module('umbraco').controller('Umbraco.Editors.DocumentTypes.EditController', DocumentTypesEditController);
    }());
    angular.module('umbraco').controller('Umbraco.Editors.DocumentTypes.MoveController', function ($scope, contentTypeResource, treeService, navigationService, notificationsService, appState, eventsService) {
        var dialogOptions = $scope.dialogOptions;
        $scope.dialogTreeEventHandler = $({});
        function nodeSelectHandler(ev, args) {
            args.event.preventDefault();
            args.event.stopPropagation();
            if ($scope.target) {
                //un-select if there's a current one selected
                $scope.target.selected = false;
            }
            $scope.target = args.node;
            $scope.target.selected = true;
        }
        $scope.move = function () {
            $scope.busy = true;
            $scope.error = false;
            contentTypeResource.move({
                parentId: $scope.target.id,
                id: dialogOptions.currentNode.id
            }).then(function (path) {
                $scope.error = false;
                $scope.success = true;
                $scope.busy = false;
                //first we need to remove the node that launched the dialog
                treeService.removeNode($scope.currentNode);
                //get the currently edited node (if any)
                var activeNode = appState.getTreeState('selectedNode');
                //we need to do a double sync here: first sync to the moved content - but don't activate the node,
                //then sync to the currenlty edited content (note: this might not be the content that was moved!!)
                navigationService.syncTree({
                    tree: 'documentTypes',
                    path: path,
                    forceReload: true,
                    activate: false
                }).then(function (args) {
                    if (activeNode) {
                        var activeNodePath = treeService.getPath(activeNode).join();
                        //sync to this node now - depending on what was copied this might already be synced but might not be
                        navigationService.syncTree({
                            tree: 'documentTypes',
                            path: activeNodePath,
                            forceReload: false,
                            activate: true
                        });
                    }
                });
                eventsService.emit('app.refreshEditor');
            }, function (err) {
                $scope.success = false;
                $scope.error = err;
                $scope.busy = false;
                //show any notifications
                if (angular.isArray(err.data.notifications)) {
                    for (var i = 0; i < err.data.notifications.length; i++) {
                        notificationsService.showNotification(err.data.notifications[i]);
                    }
                }
            });
        };
        $scope.dialogTreeEventHandler.bind('treeNodeSelect', nodeSelectHandler);
        $scope.$on('$destroy', function () {
            $scope.dialogTreeEventHandler.unbind('treeNodeSelect', nodeSelectHandler);
        });
    });
    angular.module('umbraco').controller('Umbraco.Editors.ContentTypeContainers.RenameController', [
        '$scope',
        '$injector',
        'navigationService',
        'notificationsService',
        'localizationService',
        function (scope, injector, navigationService, notificationsService, localizationService) {
            var notificationHeader;
            function reportSuccessAndClose(treeName) {
                var lastComma = scope.currentNode.path.lastIndexOf(','), path = lastComma === -1 ? scope.currentNode.path : scope.currentNode.path.substring(0, lastComma - 1);
                navigationService.syncTree({
                    tree: treeName,
                    path: path,
                    forceReload: true,
                    activate: true
                });
                localizationService.localize('renamecontainer_folderWasRenamed', [
                    scope.currentNode.name,
                    scope.model.folderName
                ]).then(function (msg) {
                    notificationsService.showNotification({
                        type: 0,
                        header: notificationHeader,
                        message: msg
                    });
                });
                navigationService.hideMenu();
            }
            localizationService.localize('renamecontainer_renamed').then(function (s) {
                notificationHeader = s;
            });
            scope.model = { folderName: scope.currentNode.name };
            scope.renameContainer = function (resourceKey, treeName) {
                var resource = injector.get(resourceKey);
                resource.renameContainer(scope.currentNode.id, scope.model.folderName).then(function () {
                    reportSuccessAndClose(treeName);
                }, function (err) {
                    scope.error = err;
                    if (angular.isArray(err.data.notifications)) {
                        for (var i = 0; i < err.data.notifications.length; i++) {
                            notificationsService.showNotification(err.data.notifications[i]);
                        }
                    }
                });
            };
        }
    ]);
    /**
 * @ngdoc controller
 * @name Umbraco.Editors.DocumentType.PropertyController
 * @function
 *
 * @description
 * The controller for the content type editor property dialog
 */
    (function () {
        'use strict';
        function PermissionsController($scope, contentTypeResource, iconHelper, contentTypeHelper, localizationService) {
            /* ----------- SCOPE VARIABLES ----------- */
            var vm = this;
            var childNodeSelectorOverlayTitle = '';
            vm.contentTypes = [];
            vm.selectedChildren = [];
            vm.overlayTitle = '';
            vm.addChild = addChild;
            vm.removeChild = removeChild;
            vm.toggle = toggle;
            /* ---------- INIT ---------- */
            init();
            function init() {
                childNodeSelectorOverlayTitle = localizationService.localize('contentTypeEditor_chooseChildNode');
                contentTypeResource.getAll().then(function (contentTypes) {
                    vm.contentTypes = contentTypes;
                    // convert legacy icons
                    iconHelper.formatContentTypeIcons(vm.contentTypes);
                    vm.selectedChildren = contentTypeHelper.makeObjectArrayFromId($scope.model.allowedContentTypes, vm.contentTypes);
                    if ($scope.model.id === 0) {
                        contentTypeHelper.insertChildNodePlaceholder(vm.contentTypes, $scope.model.name, $scope.model.icon, $scope.model.id);
                    }
                });
            }
            function addChild($event) {
                vm.childNodeSelectorOverlay = {
                    view: 'itempicker',
                    title: childNodeSelectorOverlayTitle,
                    availableItems: vm.contentTypes,
                    selectedItems: vm.selectedChildren,
                    event: $event,
                    show: true,
                    submit: function (model) {
                        vm.selectedChildren.push(model.selectedItem);
                        $scope.model.allowedContentTypes.push(model.selectedItem.id);
                        vm.childNodeSelectorOverlay.show = false;
                        vm.childNodeSelectorOverlay = null;
                    }
                };
            }
            function removeChild(selectedChild, index) {
                // remove from vm
                vm.selectedChildren.splice(index, 1);
                // remove from content type model
                var selectedChildIndex = $scope.model.allowedContentTypes.indexOf(selectedChild.id);
                $scope.model.allowedContentTypes.splice(selectedChildIndex, 1);
            }
            /**
         * Toggle the $scope.model.allowAsRoot value to either true or false
         */
            function toggle() {
                if ($scope.model.allowAsRoot) {
                    $scope.model.allowAsRoot = false;
                    return;
                }
                $scope.model.allowAsRoot = true;
            }
        }
        angular.module('umbraco').controller('Umbraco.Editors.DocumentType.PermissionsController', PermissionsController);
    }());
    /**
 * @ngdoc controller
 * @name Umbraco.Editors.DocumentType.TemplatesController
 * @function
 *
 * @description
 * The controller for the content type editor templates sub view
 */
    (function () {
        'use strict';
        function TemplatesController($scope, entityResource, contentTypeHelper, templateResource, $routeParams) {
            /* ----------- SCOPE VARIABLES ----------- */
            var vm = this;
            vm.availableTemplates = [];
            vm.canCreateTemplate = false;
            vm.updateTemplatePlaceholder = false;
            vm.createTemplate = createTemplate;
            /* ---------- INIT ---------- */
            function onInit() {
                entityResource.getAll('Template').then(function (templates) {
                    vm.availableTemplates = templates;
                    // update placeholder template information on new doc types
                    if (!$routeParams.notemplate && $scope.model.id === 0) {
                        vm.updateTemplatePlaceholder = true;
                        vm.availableTemplates = contentTypeHelper.insertTemplatePlaceholder(vm.availableTemplates);
                    }
                    checkIfTemplateExists();
                });
            }
            function createTemplate() {
                vm.createTemplateButtonState = 'busy';
                templateResource.getScaffold(-1).then(function (template) {
                    template.alias = $scope.model.alias;
                    template.name = $scope.model.name;
                    templateResource.save(template).then(function (savedTemplate) {
                        // add icon
                        savedTemplate.icon = 'icon-layout';
                        vm.availableTemplates.push(savedTemplate);
                        vm.canCreateTemplate = false;
                        $scope.model.allowedTemplates.push(savedTemplate);
                        if ($scope.model.defaultTemplate === null) {
                            $scope.model.defaultTemplate = savedTemplate;
                        }
                        vm.createTemplateButtonState = 'success';
                    }, function () {
                        vm.createTemplateButtonState = 'error';
                    });
                }, function () {
                    vm.createTemplateButtonState = 'error';
                });
            }
            ;
            function checkIfTemplateExists() {
                var existingTemplate = vm.availableTemplates.find(function (availableTemplate) {
                    return availableTemplate.name === $scope.model.name || availableTemplate.placeholder;
                });
                vm.canCreateTemplate = existingTemplate ? false : true;
            }
            onInit();
        }
        angular.module('umbraco').controller('Umbraco.Editors.DocumentType.TemplatesController', TemplatesController);
    }());
    /**
 * @ngdoc controller
 * @name Umbraco.Editors.Media.CreateController
 * @function
 * 
 * @description
 * The controller for the media creation dialog
 */
    function mediaCreateController($scope, $routeParams, $location, mediaTypeResource, iconHelper, navigationService) {
        mediaTypeResource.getAllowedTypes($scope.currentNode.id).then(function (data) {
            $scope.allowedTypes = iconHelper.formatContentTypeIcons(data);
        });
        $scope.createMediaItem = function (docType) {
            $location.path('/media/media/edit/' + $scope.currentNode.id).search('doctype', docType.alias).search('create', 'true');
            navigationService.hideMenu();
        };
    }
    angular.module('umbraco').controller('Umbraco.Editors.Media.CreateController', mediaCreateController);
    /**
 * @ngdoc controller
 * @name Umbraco.Editors.ContentDeleteController
 * @function
 * 
 * @description
 * The controller for deleting content
 */
    function MediaDeleteController($scope, mediaResource, treeService, navigationService, editorState, $location, dialogService, notificationsService) {
        $scope.performDelete = function () {
            // stop from firing again on double-click
            if ($scope.busy) {
                return false;
            }
            //mark it for deletion (used in the UI)
            $scope.currentNode.loading = true;
            $scope.busy = true;
            mediaResource.deleteById($scope.currentNode.id).then(function () {
                $scope.currentNode.loading = false;
                //get the root node before we remove it
                var rootNode = treeService.getTreeRoot($scope.currentNode);
                treeService.removeNode($scope.currentNode);
                if (rootNode) {
                    //ensure the recycle bin has child nodes now            
                    var recycleBin = treeService.getDescendantNode(rootNode, -21);
                    if (recycleBin) {
                        recycleBin.hasChildren = true;
                        //reload the recycle bin if it's already expanded so the deleted item is shown
                        if (recycleBin.expanded) {
                            treeService.loadNodeChildren({
                                node: recycleBin,
                                section: 'media'
                            });
                        }
                    }
                }
                //if the current edited item is the same one as we're deleting, we need to navigate elsewhere
                if (editorState.current && editorState.current.id == $scope.currentNode.id) {
                    //If the deleted item lived at the root then just redirect back to the root, otherwise redirect to the item's parent
                    var location = '/media';
                    if ($scope.currentNode.parentId.toString() === '-21')
                        location = '/media/media/recyclebin';
                    else if ($scope.currentNode.parentId.toString() !== '-1')
                        location = '/media/media/edit/' + $scope.currentNode.parentId;
                    $location.path(location);
                }
                $scope.success = true;
            }, function (err) {
                $scope.currentNode.loading = false;
                $scope.busy = false;
                //check if response is ysod
                if (err.status && err.status >= 500) {
                    dialogService.ysodDialog(err);
                }
                if (err.data && angular.isArray(err.data.notifications)) {
                    for (var i = 0; i < err.data.notifications.length; i++) {
                        notificationsService.showNotification(err.data.notifications[i]);
                    }
                }
            });
        };
        $scope.cancel = function () {
            navigationService.hideDialog();
        };
    }
    angular.module('umbraco').controller('Umbraco.Editors.Media.DeleteController', MediaDeleteController);
    /**
 * @ngdoc controller
 * @name Umbraco.Editors.Media.EditController
 * @function
 * 
 * @description
 * The controller for the media editor
 */
    function mediaEditController($scope, $routeParams, appState, mediaResource, entityResource, navigationService, notificationsService, angularHelper, serverValidationManager, contentEditingHelper, fileManager, treeService, formHelper, umbModelMapper, editorState, umbRequestHelper, $http) {
        //setup scope vars
        $scope.currentSection = appState.getSectionState('currentSection');
        $scope.currentNode = null;
        //the editors affiliated node
        $scope.page = {};
        $scope.page.loading = false;
        $scope.page.menu = {};
        $scope.page.menu.currentSection = appState.getSectionState('currentSection');
        $scope.page.menu.currentNode = null;
        //the editors affiliated node
        $scope.page.listViewPath = null;
        $scope.page.saveButtonState = 'init';
        /** Syncs the content item to it's tree node - this occurs on first load and after saving */
        function syncTreeNode(content, path, initialLoad) {
            if (!$scope.content.isChildOfListView) {
                navigationService.syncTree({
                    tree: 'media',
                    path: path.split(','),
                    forceReload: initialLoad !== true
                }).then(function (syncArgs) {
                    $scope.page.menu.currentNode = syncArgs.node;
                });
            } else if (initialLoad === true) {
                //it's a child item, just sync the ui node to the parent
                navigationService.syncTree({
                    tree: 'media',
                    path: path.substring(0, path.lastIndexOf(',')).split(','),
                    forceReload: initialLoad !== true
                });
                //if this is a child of a list view and it's the initial load of the editor, we need to get the tree node 
                // from the server so that we can load in the actions menu.
                umbRequestHelper.resourcePromise($http.get(content.treeNodeUrl), 'Failed to retrieve data for child node ' + content.id).then(function (node) {
                    $scope.page.menu.currentNode = node;
                });
            }
        }
        if ($routeParams.create) {
            $scope.page.loading = true;
            mediaResource.getScaffold($routeParams.id, $routeParams.doctype).then(function (data) {
                $scope.content = data;
                editorState.set($scope.content);
                // We don't get the info tab from the server from version 7.8 so we need to manually add it
                contentEditingHelper.addInfoTab($scope.content.tabs);
                $scope.page.loading = false;
            });
        } else {
            $scope.page.loading = true;
            mediaResource.getById($routeParams.id).then(function (data) {
                $scope.content = data;
                if (data.isChildOfListView && data.trashed === false) {
                    $scope.page.listViewPath = $routeParams.page ? '/media/media/edit/' + data.parentId + '?page=' + $routeParams.page : '/media/media/edit/' + data.parentId;
                }
                editorState.set($scope.content);
                //in one particular special case, after we've created a new item we redirect back to the edit
                // route but there might be server validation errors in the collection which we need to display
                // after the redirect, so we will bind all subscriptions which will show the server validation errors
                // if there are any and then clear them so the collection no longer persists them.
                serverValidationManager.executeAndClearAllSubscriptions();
                syncTreeNode($scope.content, data.path, true);
                if ($scope.content.parentId && $scope.content.parentId != -1) {
                    //We fetch all ancestors of the node to generate the footer breadcrump navigation
                    entityResource.getAncestors($routeParams.id, 'media').then(function (anc) {
                        $scope.ancestors = anc;
                    });
                }
                // We don't get the info tab from the server from version 7.8 so we need to manually add it
                contentEditingHelper.addInfoTab($scope.content.tabs);
                $scope.page.loading = false;
            });
        }
        $scope.save = function () {
            if (!$scope.busy && formHelper.submitForm({
                    scope: $scope,
                    statusMessage: 'Saving...'
                })) {
                $scope.busy = true;
                $scope.page.saveButtonState = 'busy';
                mediaResource.save($scope.content, $routeParams.create, fileManager.getFiles()).then(function (data) {
                    formHelper.resetForm({
                        scope: $scope,
                        notifications: data.notifications
                    });
                    contentEditingHelper.handleSuccessfulSave({
                        scope: $scope,
                        savedContent: data,
                        rebindCallback: contentEditingHelper.reBindChangedProperties($scope.content, data)
                    });
                    editorState.set($scope.content);
                    $scope.busy = false;
                    syncTreeNode($scope.content, data.path);
                    $scope.page.saveButtonState = 'success';
                }, function (err) {
                    contentEditingHelper.handleSaveError({
                        err: err,
                        redirectOnFailure: true,
                        rebindCallback: contentEditingHelper.reBindChangedProperties($scope.content, err.data)
                    });
                    //show any notifications
                    if (angular.isArray(err.data.notifications)) {
                        for (var i = 0; i < err.data.notifications.length; i++) {
                            notificationsService.showNotification(err.data.notifications[i]);
                        }
                    }
                    editorState.set($scope.content);
                    $scope.busy = false;
                    $scope.page.saveButtonState = 'error';
                });
            } else {
                $scope.busy = false;
            }
        };
    }
    angular.module('umbraco').controller('Umbraco.Editors.Media.EditController', mediaEditController);
    /**
 * @ngdoc controller
 * @name Umbraco.Editors.Media.EmptyRecycleBinController
 * @function
 * 
 * @description
 * The controller for deleting media
 */
    function MediaEmptyRecycleBinController($scope, mediaResource, treeService, navigationService, notificationsService, $route) {
        $scope.busy = false;
        $scope.performDelete = function () {
            //(used in the UI)
            $scope.busy = true;
            $scope.currentNode.loading = true;
            mediaResource.emptyRecycleBin($scope.currentNode.id).then(function (result) {
                $scope.busy = false;
                $scope.currentNode.loading = false;
                //show any notifications
                if (angular.isArray(result.notifications)) {
                    for (var i = 0; i < result.notifications.length; i++) {
                        notificationsService.showNotification(result.notifications[i]);
                    }
                }
                treeService.removeChildNodes($scope.currentNode);
                navigationService.hideMenu();
                //reload the current view
                $route.reload();
            });
        };
        $scope.cancel = function () {
            navigationService.hideDialog();
        };
    }
    angular.module('umbraco').controller('Umbraco.Editors.Media.EmptyRecycleBinController', MediaEmptyRecycleBinController);
    //used for the media picker dialog
    angular.module('umbraco').controller('Umbraco.Editors.Media.MoveController', function ($scope, userService, eventsService, mediaResource, appState, treeService, navigationService) {
        var dialogOptions = $scope.dialogOptions;
        $scope.dialogTreeEventHandler = $({});
        var node = dialogOptions.currentNode;
        $scope.busy = false;
        $scope.searchInfo = {
            searchFromId: null,
            searchFromName: null,
            showSearch: false,
            results: [],
            selectedSearchResults: []
        };
        $scope.treeModel = { hideHeader: false };
        userService.getCurrentUser().then(function (userData) {
            $scope.treeModel.hideHeader = userData.startMediaIds.length > 0 && userData.startMediaIds.indexOf(-1) == -1;
        });
        function treeLoadedHandler(ev, args) {
            if (node && node.path) {
                $scope.dialogTreeEventHandler.syncTree({
                    path: node.path,
                    activate: false
                });
            }
        }
        function nodeSelectHandler(ev, args) {
            if (args && args.event) {
                args.event.preventDefault();
                args.event.stopPropagation();
            }
            eventsService.emit('editors.media.moveController.select', args);
            if ($scope.target) {
                //un-select if there's a current one selected
                $scope.target.selected = false;
            }
            $scope.target = args.node;
            $scope.target.selected = true;
        }
        function nodeExpandedHandler(ev, args) {
            // open mini list view for list views
            if (args.node.metaData.isContainer) {
                openMiniListView(args.node);
            }
        }
        $scope.hideSearch = function () {
            $scope.searchInfo.showSearch = false;
            $scope.searchInfo.searchFromId = null;
            $scope.searchInfo.searchFromName = null;
            $scope.searchInfo.results = [];
        };
        // method to select a search result 
        $scope.selectResult = function (evt, result) {
            result.selected = result.selected === true ? false : true;
            nodeSelectHandler(evt, {
                event: evt,
                node: result
            });
        };
        //callback when there are search results 
        $scope.onSearchResults = function (results) {
            $scope.searchInfo.results = results;
            $scope.searchInfo.showSearch = true;
        };
        $scope.move = function () {
            $scope.busy = true;
            mediaResource.move({
                parentId: $scope.target.id,
                id: node.id
            }).then(function (path) {
                $scope.busy = false;
                $scope.error = false;
                $scope.success = true;
                //first we need to remove the node that launched the dialog
                treeService.removeNode($scope.currentNode);
                //get the currently edited node (if any)
                var activeNode = appState.getTreeState('selectedNode');
                //we need to do a double sync here: first sync to the moved content - but don't activate the node,
                //then sync to the currenlty edited content (note: this might not be the content that was moved!!)
                navigationService.syncTree({
                    tree: 'media',
                    path: path,
                    forceReload: true,
                    activate: false
                }).then(function (args) {
                    if (activeNode) {
                        var activeNodePath = treeService.getPath(activeNode).join();
                        //sync to this node now - depending on what was copied this might already be synced but might not be
                        navigationService.syncTree({
                            tree: 'media',
                            path: activeNodePath,
                            forceReload: false,
                            activate: true
                        });
                    }
                });
            }, function (err) {
                $scope.success = false;
                $scope.error = err;
            });
        };
        $scope.dialogTreeEventHandler.bind('treeLoaded', treeLoadedHandler);
        $scope.dialogTreeEventHandler.bind('treeNodeSelect', nodeSelectHandler);
        $scope.dialogTreeEventHandler.bind('treeNodeExpanded', nodeExpandedHandler);
        $scope.$on('$destroy', function () {
            $scope.dialogTreeEventHandler.unbind('treeLoaded', treeLoadedHandler);
            $scope.dialogTreeEventHandler.unbind('treeNodeSelect', nodeSelectHandler);
            $scope.dialogTreeEventHandler.unbind('treeNodeExpanded', nodeExpandedHandler);
        });
        // Mini list view
        $scope.selectListViewNode = function (node) {
            node.selected = node.selected === true ? false : true;
            nodeSelectHandler({}, { node: node });
        };
        $scope.closeMiniListView = function () {
            $scope.miniListView = undefined;
        };
        function openMiniListView(node) {
            $scope.miniListView = node;
        }
    });
    /**
 * @ngdoc controller
 * @name Umbraco.Editors.Content.MediaRecycleBinController
 * @function
 * 
 * @description
 * Controls the recycle bin for media
 * 
 */
    function MediaRecycleBinController($scope, $routeParams, mediaResource, navigationService, localizationService) {
        //ensures the list view doesn't actually load until we query for the list view config
        // for the section
        $scope.page = {};
        $scope.page.name = 'Recycle Bin';
        $scope.page.nameLocked = true;
        //ensures the list view doesn't actually load until we query for the list view config
        // for the section
        $scope.listViewPath = null;
        $routeParams.id = '-21';
        mediaResource.getRecycleBin().then(function (result) {
            //we'll get the 'content item' for the recycle bin, we know that it will contain a single tab and a 
            // single property, so we'll extract that property (list view) and use it's data.
            var listproperty = result.tabs[0].properties[0];
            _.each(listproperty.config, function (val, key) {
                $scope.model.config[key] = val;
            });
            $scope.listViewPath = 'views/propertyeditors/listview/listview.html';
        });
        $scope.model = {
            config: {
                entityType: $routeParams.section,
                layouts: []
            }
        };
        // sync tree node
        navigationService.syncTree({
            tree: 'media',
            path: [
                '-1',
                $routeParams.id
            ],
            forceReload: false
        });
        localizePageName();
        function localizePageName() {
            var pageName = 'general_recycleBin';
            localizationService.localize(pageName).then(function (value) {
                $scope.page.name = value;
            });
        }
    }
    angular.module('umbraco').controller('Umbraco.Editors.Media.RecycleBinController', MediaRecycleBinController);
    angular.module('umbraco').controller('Umbraco.Editors.Media.RestoreController', function ($scope, relationResource, mediaResource, navigationService, appState, treeService, userService, localizationService) {
        var dialogOptions = $scope.dialogOptions;
        $scope.source = _.clone(dialogOptions.currentNode);
        $scope.error = null;
        $scope.loading = true;
        $scope.moving = false;
        $scope.success = false;
        $scope.dialogTreeEventHandler = $({});
        $scope.searchInfo = {
            showSearch: false,
            results: [],
            selectedSearchResults: []
        };
        $scope.treeModel = { hideHeader: false };
        userService.getCurrentUser().then(function (userData) {
            $scope.treeModel.hideHeader = userData.startContentIds.length > 0 && userData.startContentIds.indexOf(-1) == -1;
        });
        $scope.labels = {};
        localizationService.localizeMany(['treeHeaders_media']).then(function (data) {
            $scope.labels.treeRoot = data[0];
        });
        function nodeSelectHandler(ev, args) {
            if (args && args.event) {
                args.event.preventDefault();
                args.event.stopPropagation();
            }
            if ($scope.target) {
                //un-select if there's a current one selected
                $scope.target.selected = false;
            }
            $scope.target = args.node;
            $scope.target.selected = true;
        }
        function nodeExpandedHandler(ev, args) {
            // open mini list view for list views
            if (args.node.metaData.isContainer) {
                openMiniListView(args.node);
            }
        }
        $scope.hideSearch = function () {
            $scope.searchInfo.showSearch = false;
            $scope.searchInfo.results = [];
        };
        // method to select a search result 
        $scope.selectResult = function (evt, result) {
            result.selected = result.selected === true ? false : true;
            nodeSelectHandler(evt, {
                event: evt,
                node: result
            });
        };
        //callback when there are search results 
        $scope.onSearchResults = function (results) {
            $scope.searchInfo.results = results;
            $scope.searchInfo.showSearch = true;
        };
        $scope.dialogTreeEventHandler.bind('treeNodeSelect', nodeSelectHandler);
        $scope.dialogTreeEventHandler.bind('treeNodeExpanded', nodeExpandedHandler);
        $scope.$on('$destroy', function () {
            $scope.dialogTreeEventHandler.unbind('treeNodeSelect', nodeSelectHandler);
            $scope.dialogTreeEventHandler.unbind('treeNodeExpanded', nodeExpandedHandler);
        });
        // Mini list view
        $scope.selectListViewNode = function (node) {
            node.selected = node.selected === true ? false : true;
            nodeSelectHandler({}, { node: node });
        };
        $scope.closeMiniListView = function () {
            $scope.miniListView = undefined;
        };
        function openMiniListView(node) {
            $scope.miniListView = node;
        }
        relationResource.getByChildId($scope.source.id, 'relateParentMediaFolderOnDelete').then(function (data) {
            $scope.loading = false;
            if (!data.length) {
                $scope.moving = true;
                return;
            }
            $scope.relation = data[0];
            if ($scope.relation.parentId == -1) {
                $scope.target = {
                    id: -1,
                    name: $scope.labels.treeRoot
                };
            } else {
                $scope.loading = true;
                mediaResource.getById($scope.relation.parentId).then(function (data) {
                    $scope.loading = false;
                    $scope.target = data;
                    // make sure the target item isn't in the recycle bin
                    if ($scope.target.path.indexOf('-21') !== -1) {
                        $scope.moving = true;
                        $scope.target = null;
                    }
                }, function (err) {
                    $scope.loading = false;
                    $scope.error = err;
                });
            }
        }, function (err) {
            $scope.loading = false;
            $scope.error = err;
        });
        $scope.restore = function () {
            $scope.loading = true;
            // this code was copied from `content.move.controller.js`
            mediaResource.move({
                parentId: $scope.target.id,
                id: $scope.source.id
            }).then(function (path) {
                $scope.loading = false;
                $scope.success = true;
                //first we need to remove the node that launched the dialog
                treeService.removeNode($scope.currentNode);
                //get the currently edited node (if any)
                var activeNode = appState.getTreeState('selectedNode');
                //we need to do a double sync here: first sync to the moved media item - but don't activate the node,
                //then sync to the currenlty edited media item (note: this might not be the media item that was moved!!)
                navigationService.syncTree({
                    tree: 'media',
                    path: path,
                    forceReload: true,
                    activate: false
                }).then(function (args) {
                    if (activeNode) {
                        var activeNodePath = treeService.getPath(activeNode).join();
                        //sync to this node now - depending on what was copied this might already be synced but might not be
                        navigationService.syncTree({
                            tree: 'media',
                            path: activeNodePath,
                            forceReload: false,
                            activate: true
                        });
                    }
                });
            }, function (err) {
                $scope.loading = false;
                $scope.error = err;
            });
        };
    });
    angular.module('umbraco').controller('Umbraco.Editors.MediaTypes.CopyController', function ($scope, mediaTypeResource, treeService, navigationService, notificationsService, appState, eventsService) {
        var dialogOptions = $scope.dialogOptions;
        $scope.dialogTreeEventHandler = $({});
        function nodeSelectHandler(ev, args) {
            args.event.preventDefault();
            args.event.stopPropagation();
            if ($scope.target) {
                //un-select if there's a current one selected
                $scope.target.selected = false;
            }
            $scope.target = args.node;
            $scope.target.selected = true;
        }
        $scope.copy = function () {
            $scope.busy = true;
            $scope.error = false;
            mediaTypeResource.copy({
                parentId: $scope.target.id,
                id: dialogOptions.currentNode.id
            }).then(function (path) {
                $scope.error = false;
                $scope.success = true;
                $scope.busy = false;
                //get the currently edited node (if any)
                var activeNode = appState.getTreeState('selectedNode');
                //we need to do a double sync here: first sync to the copied content - but don't activate the node,
                //then sync to the currenlty edited content (note: this might not be the content that was copied!!)
                navigationService.syncTree({
                    tree: 'mediaTypes',
                    path: path,
                    forceReload: true,
                    activate: false
                }).then(function (args) {
                    if (activeNode) {
                        var activeNodePath = treeService.getPath(activeNode).join();
                        //sync to this node now - depending on what was copied this might already be synced but might not be
                        navigationService.syncTree({
                            tree: 'mediaTypes',
                            path: activeNodePath,
                            forceReload: false,
                            activate: true
                        });
                    }
                });
            }, function (err) {
                $scope.success = false;
                $scope.error = err;
                $scope.busy = false;
                //show any notifications
                if (angular.isArray(err.data.notifications)) {
                    for (var i = 0; i < err.data.notifications.length; i++) {
                        notificationsService.showNotification(err.data.notifications[i]);
                    }
                }
            });
        };
        $scope.dialogTreeEventHandler.bind('treeNodeSelect', nodeSelectHandler);
        $scope.$on('$destroy', function () {
            $scope.dialogTreeEventHandler.unbind('treeNodeSelect', nodeSelectHandler);
        });
    });
    /**
 * @ngdoc controller
 * @name Umbraco.Editors.MediaType.CreateController
 * @function
 *
 * @description
 * The controller for the media type creation dialog
 */
    function MediaTypesCreateController($scope, $location, navigationService, mediaTypeResource, formHelper, appState, localizationService) {
        $scope.model = {
            folderName: '',
            creatingFolder: false
        };
        var node = $scope.dialogOptions.currentNode, localizeCreateFolder = localizationService.localize('defaultdialog_createFolder');
        $scope.showCreateFolder = function () {
            $scope.model.creatingFolder = true;
        };
        $scope.createContainer = function () {
            if (formHelper.submitForm({
                    scope: $scope,
                    formCtrl: this.createFolderForm,
                    statusMessage: localizeCreateFolder
                })) {
                mediaTypeResource.createContainer(node.id, $scope.model.folderName).then(function (folderId) {
                    navigationService.hideMenu();
                    var currPath = node.path ? node.path : '-1';
                    navigationService.syncTree({
                        tree: 'mediatypes',
                        path: currPath + ',' + folderId,
                        forceReload: true,
                        activate: true
                    });
                    formHelper.resetForm({ scope: $scope });
                    var section = appState.getSectionState('currentSection');
                }, function (err) {
                    $scope.error = err;
                });
            }
            ;
        };
        $scope.createMediaType = function () {
            $location.search('create', null);
            $location.path('/settings/mediatypes/edit/' + node.id).search('create', 'true');
            navigationService.hideMenu();
        };
    }
    angular.module('umbraco').controller('Umbraco.Editors.MediaTypes.CreateController', MediaTypesCreateController);
    /**
 * @ngdoc controller
 * @name Umbraco.Editors.MediaType.DeleteController
 * @function
 *
 * @description
 * The controller for the media type delete dialog
 */
    function MediaTypesDeleteController($scope, dataTypeResource, mediaTypeResource, treeService, navigationService) {
        $scope.performDelete = function () {
            //mark it for deletion (used in the UI)
            $scope.currentNode.loading = true;
            mediaTypeResource.deleteById($scope.currentNode.id).then(function () {
                $scope.currentNode.loading = false;
                //get the root node before we remove it
                var rootNode = treeService.getTreeRoot($scope.currentNode);
                //TODO: Need to sync tree, etc...
                treeService.removeNode($scope.currentNode);
                navigationService.hideMenu();
            });
        };
        $scope.performContainerDelete = function () {
            //mark it for deletion (used in the UI)
            $scope.currentNode.loading = true;
            mediaTypeResource.deleteContainerById($scope.currentNode.id).then(function () {
                $scope.currentNode.loading = false;
                //get the root node before we remove it
                var rootNode = treeService.getTreeRoot($scope.currentNode);
                //TODO: Need to sync tree, etc...
                treeService.removeNode($scope.currentNode);
                navigationService.hideMenu();
            });
        };
        $scope.cancel = function () {
            navigationService.hideDialog();
        };
    }
    angular.module('umbraco').controller('Umbraco.Editors.MediaTypes.DeleteController', MediaTypesDeleteController);
    /**
 * @ngdoc controller
 * @name Umbraco.Editors.MediaType.EditController
 * @function
 *
 * @description
 * The controller for the media type editor
 */
    (function () {
        'use strict';
        function MediaTypesEditController($scope, $routeParams, mediaTypeResource, dataTypeResource, editorState, contentEditingHelper, formHelper, navigationService, iconHelper, contentTypeHelper, notificationsService, $filter, $q, localizationService, overlayHelper, eventsService) {
            var vm = this;
            var localizeSaving = localizationService.localize('general_saving');
            var evts = [];
            vm.save = save;
            vm.currentNode = null;
            vm.contentType = {};
            vm.page = {};
            vm.page.loading = false;
            vm.page.saveButtonState = 'init';
            vm.page.navigation = [
                {
                    'name': localizationService.localize('general_design'),
                    'icon': 'icon-document-dashed-line',
                    'view': 'views/mediatypes/views/design/design.html',
                    'active': true
                },
                {
                    'name': localizationService.localize('general_listView'),
                    'icon': 'icon-list',
                    'view': 'views/mediatypes/views/listview/listview.html'
                },
                {
                    'name': localizationService.localize('general_rights'),
                    'icon': 'icon-keychain',
                    'view': 'views/mediatypes/views/permissions/permissions.html'
                }
            ];
            vm.page.keyboardShortcutsOverview = [
                {
                    'name': localizationService.localize('main_sections'),
                    'shortcuts': [{
                            'description': localizationService.localize('shortcuts_navigateSections'),
                            'keys': [
                                { 'key': '1' },
                                { 'key': '3' }
                            ],
                            'keyRange': true
                        }]
                },
                {
                    'name': localizationService.localize('general_design'),
                    'shortcuts': [
                        {
                            'description': localizationService.localize('shortcuts_addTab'),
                            'keys': [
                                { 'key': 'alt' },
                                { 'key': 'shift' },
                                { 'key': 't' }
                            ]
                        },
                        {
                            'description': localizationService.localize('shortcuts_addProperty'),
                            'keys': [
                                { 'key': 'alt' },
                                { 'key': 'shift' },
                                { 'key': 'p' }
                            ]
                        },
                        {
                            'description': localizationService.localize('shortcuts_addEditor'),
                            'keys': [
                                { 'key': 'alt' },
                                { 'key': 'shift' },
                                { 'key': 'e' }
                            ]
                        },
                        {
                            'description': localizationService.localize('shortcuts_editDataType'),
                            'keys': [
                                { 'key': 'alt' },
                                { 'key': 'shift' },
                                { 'key': 'd' }
                            ]
                        }
                    ]
                },
                {
                    'name': localizationService.localize('general_listView'),
                    'shortcuts': [{
                            'description': localizationService.localize('shortcuts_toggleListView'),
                            'keys': [
                                { 'key': 'alt' },
                                { 'key': 'shift' },
                                { 'key': 'l' }
                            ]
                        }]
                },
                {
                    'name': localizationService.localize('general_rights'),
                    'shortcuts': [
                        {
                            'description': localizationService.localize('shortcuts_toggleAllowAsRoot'),
                            'keys': [
                                { 'key': 'alt' },
                                { 'key': 'shift' },
                                { 'key': 'r' }
                            ]
                        },
                        {
                            'description': localizationService.localize('shortcuts_addChildNode'),
                            'keys': [
                                { 'key': 'alt' },
                                { 'key': 'shift' },
                                { 'key': 'c' }
                            ]
                        }
                    ]
                }
            ];
            contentTypeHelper.checkModelsBuilderStatus().then(function (result) {
                vm.page.modelsBuilder = result;
                if (result) {
                    //Models builder mode:
                    vm.page.defaultButton = {
                        hotKey: 'ctrl+s',
                        hotKeyWhenHidden: true,
                        labelKey: 'buttons_save',
                        letter: 'S',
                        type: 'submit',
                        handler: function () {
                            vm.save();
                        }
                    };
                    vm.page.subButtons = [{
                            hotKey: 'ctrl+g',
                            hotKeyWhenHidden: true,
                            labelKey: 'buttons_saveAndGenerateModels',
                            letter: 'G',
                            handler: function () {
                                vm.page.saveButtonState = 'busy';
                                vm.save().then(function (result) {
                                    vm.page.saveButtonState = 'busy';
                                    localizationService.localize('modelsBuilder_buildingModels').then(function (headerValue) {
                                        localizationService.localize('modelsBuilder_waitingMessage').then(function (msgValue) {
                                            notificationsService.info(headerValue, msgValue);
                                        });
                                    });
                                    contentTypeHelper.generateModels().then(function (result) {
                                        if (!result.lastError) {
                                            //re-check model status
                                            contentTypeHelper.checkModelsBuilderStatus().then(function (statusResult) {
                                                vm.page.modelsBuilder = statusResult;
                                            });
                                            //clear and add success
                                            vm.page.saveButtonState = 'init';
                                            localizationService.localize('modelsBuilder_modelsGenerated').then(function (value) {
                                                notificationsService.success(value);
                                            });
                                        } else {
                                            vm.page.saveButtonState = 'error';
                                            localizationService.localize('modelsBuilder_modelsExceptionInUlog').then(function (value) {
                                                notificationsService.error(value);
                                            });
                                        }
                                    }, function () {
                                        vm.page.saveButtonState = 'error';
                                        localizationService.localize('modelsBuilder_modelsGeneratedError').then(function (value) {
                                            notificationsService.error(value);
                                        });
                                    });
                                });
                            }
                        }];
                }
            });
            if ($routeParams.create) {
                vm.page.loading = true;
                //we are creating so get an empty data type item
                mediaTypeResource.getScaffold($routeParams.id).then(function (dt) {
                    init(dt);
                    vm.page.loading = false;
                });
            } else {
                loadMediaType();
            }
            function loadMediaType() {
                vm.page.loading = true;
                mediaTypeResource.getById($routeParams.id).then(function (dt) {
                    init(dt);
                    syncTreeNode(vm.contentType, dt.path, true);
                    vm.page.loading = false;
                });
            }
            /* ---------- SAVE ---------- */
            function save() {
                // only save if there is no overlays open
                if (overlayHelper.getNumberOfOverlays() === 0) {
                    var deferred = $q.defer();
                    vm.page.saveButtonState = 'busy';
                    // reformat allowed content types to array if id's
                    vm.contentType.allowedContentTypes = contentTypeHelper.createIdArray(vm.contentType.allowedContentTypes);
                    contentEditingHelper.contentEditorPerformSave({
                        statusMessage: localizeSaving,
                        saveMethod: mediaTypeResource.save,
                        scope: $scope,
                        content: vm.contentType,
                        //We do not redirect on failure for doc types - this is because it is not possible to actually save the doc
                        // type when server side validation fails - as opposed to content where we are capable of saving the content
                        // item if server side validation fails
                        redirectOnFailure: false,
                        // we need to rebind... the IDs that have been created!
                        rebindCallback: function (origContentType, savedContentType) {
                            vm.contentType.id = savedContentType.id;
                            vm.contentType.groups.forEach(function (group) {
                                if (!group.name)
                                    return;
                                var k = 0;
                                while (k < savedContentType.groups.length && savedContentType.groups[k].name != group.name)
                                    k++;
                                if (k == savedContentType.groups.length) {
                                    group.id = 0;
                                    return;
                                }
                                var savedGroup = savedContentType.groups[k];
                                if (!group.id)
                                    group.id = savedGroup.id;
                                group.properties.forEach(function (property) {
                                    if (property.id || !property.alias)
                                        return;
                                    k = 0;
                                    while (k < savedGroup.properties.length && savedGroup.properties[k].alias != property.alias)
                                        k++;
                                    if (k == savedGroup.properties.length) {
                                        property.id = 0;
                                        return;
                                    }
                                    var savedProperty = savedGroup.properties[k];
                                    property.id = savedProperty.id;
                                });
                            });
                        }
                    }).then(function (data) {
                        //success
                        syncTreeNode(vm.contentType, data.path);
                        vm.page.saveButtonState = 'success';
                        deferred.resolve(data);
                    }, function (err) {
                        //error
                        if (err) {
                            editorState.set($scope.content);
                        } else {
                            localizationService.localize('speechBubbles_validationFailedHeader').then(function (headerValue) {
                                localizationService.localize('speechBubbles_validationFailedMessage').then(function (msgValue) {
                                    notificationsService.error(headerValue, msgValue);
                                });
                            });
                        }
                        vm.page.saveButtonState = 'error';
                        deferred.reject(err);
                    });
                    return deferred.promise;
                }
            }
            function init(contentType) {
                // set all tab to inactive
                if (contentType.groups.length !== 0) {
                    angular.forEach(contentType.groups, function (group) {
                        angular.forEach(group.properties, function (property) {
                            // get data type details for each property
                            getDataTypeDetails(property);
                        });
                    });
                }
                // convert icons for content type
                convertLegacyIcons(contentType);
                //set a shared state
                editorState.set(contentType);
                vm.contentType = contentType;
            }
            function convertLegacyIcons(contentType) {
                // make array to store contentType icon
                var contentTypeArray = [];
                // push icon to array
                contentTypeArray.push({ 'icon': contentType.icon });
                // run through icon method
                iconHelper.formatContentTypeIcons(contentTypeArray);
                // set icon back on contentType
                contentType.icon = contentTypeArray[0].icon;
            }
            function getDataTypeDetails(property) {
                if (property.propertyState !== 'init') {
                    dataTypeResource.getById(property.dataTypeId).then(function (dataType) {
                        property.dataTypeIcon = dataType.icon;
                        property.dataTypeName = dataType.name;
                    });
                }
            }
            /** Syncs the content type  to it's tree node - this occurs on first load and after saving */
            function syncTreeNode(dt, path, initialLoad) {
                navigationService.syncTree({
                    tree: 'mediatypes',
                    path: path.split(','),
                    forceReload: initialLoad !== true
                }).then(function (syncArgs) {
                    vm.currentNode = syncArgs.node;
                });
            }
            evts.push(eventsService.on('app.refreshEditor', function (name, error) {
                loadMediaType();
            }));
            //ensure to unregister from all events!
            $scope.$on('$destroy', function () {
                for (var e in evts) {
                    eventsService.unsubscribe(evts[e]);
                }
            });
        }
        angular.module('umbraco').controller('Umbraco.Editors.MediaTypes.EditController', MediaTypesEditController);
    }());
    angular.module('umbraco').controller('Umbraco.Editors.MediaTypes.MoveController', function ($scope, mediaTypeResource, treeService, navigationService, notificationsService, appState, eventsService) {
        var dialogOptions = $scope.dialogOptions;
        $scope.dialogTreeEventHandler = $({});
        function nodeSelectHandler(ev, args) {
            args.event.preventDefault();
            args.event.stopPropagation();
            if ($scope.target) {
                //un-select if there's a current one selected
                $scope.target.selected = false;
            }
            $scope.target = args.node;
            $scope.target.selected = true;
        }
        $scope.move = function () {
            $scope.busy = true;
            $scope.error = false;
            mediaTypeResource.move({
                parentId: $scope.target.id,
                id: dialogOptions.currentNode.id
            }).then(function (path) {
                $scope.error = false;
                $scope.success = true;
                $scope.busy = false;
                //first we need to remove the node that launched the dialog
                treeService.removeNode($scope.currentNode);
                //get the currently edited node (if any)
                var activeNode = appState.getTreeState('selectedNode');
                //we need to do a double sync here: first sync to the moved content - but don't activate the node,
                //then sync to the currenlty edited content (note: this might not be the content that was moved!!)
                navigationService.syncTree({
                    tree: 'mediaTypes',
                    path: path,
                    forceReload: true,
                    activate: false
                }).then(function (args) {
                    if (activeNode) {
                        var activeNodePath = treeService.getPath(activeNode).join();
                        //sync to this node now - depending on what was copied this might already be synced but might not be
                        navigationService.syncTree({
                            tree: 'mediaTypes',
                            path: activeNodePath,
                            forceReload: false,
                            activate: true
                        });
                    }
                });
                eventsService.emit('app.refreshEditor');
            }, function (err) {
                $scope.success = false;
                $scope.error = err;
                $scope.busy = false;
                //show any notifications
                if (angular.isArray(err.data.notifications)) {
                    for (var i = 0; i < err.data.notifications.length; i++) {
                        notificationsService.showNotification(err.data.notifications[i]);
                    }
                }
            });
        };
        $scope.dialogTreeEventHandler.bind('treeNodeSelect', nodeSelectHandler);
        $scope.$on('$destroy', function () {
            $scope.dialogTreeEventHandler.unbind('treeNodeSelect', nodeSelectHandler);
        });
    });
    (function () {
        'use strict';
        function PermissionsController($scope, mediaTypeResource, iconHelper, contentTypeHelper, localizationService) {
            /* ----------- SCOPE VARIABLES ----------- */
            var vm = this;
            var childNodeSelectorOverlayTitle = '';
            vm.mediaTypes = [];
            vm.selectedChildren = [];
            vm.addChild = addChild;
            vm.removeChild = removeChild;
            vm.toggle = toggle;
            /* ---------- INIT ---------- */
            init();
            function init() {
                childNodeSelectorOverlayTitle = localizationService.localize('contentTypeEditor_chooseChildNode');
                mediaTypeResource.getAll().then(function (mediaTypes) {
                    vm.mediaTypes = mediaTypes;
                    // convert legacy icons
                    iconHelper.formatContentTypeIcons(vm.mediaTypes);
                    vm.selectedChildren = contentTypeHelper.makeObjectArrayFromId($scope.model.allowedContentTypes, vm.mediaTypes);
                    if ($scope.model.id === 0) {
                        contentTypeHelper.insertChildNodePlaceholder(vm.mediaTypes, $scope.model.name, $scope.model.icon, $scope.model.id);
                    }
                });
            }
            function addChild($event) {
                vm.childNodeSelectorOverlay = {
                    view: 'itempicker',
                    title: childNodeSelectorOverlayTitle,
                    availableItems: vm.mediaTypes,
                    selectedItems: vm.selectedChildren,
                    event: $event,
                    show: true,
                    submit: function (model) {
                        vm.selectedChildren.push(model.selectedItem);
                        $scope.model.allowedContentTypes.push(model.selectedItem.id);
                        vm.childNodeSelectorOverlay.show = false;
                        vm.childNodeSelectorOverlay = null;
                    }
                };
            }
            function removeChild(selectedChild, index) {
                // remove from vm
                vm.selectedChildren.splice(index, 1);
                // remove from content type model
                var selectedChildIndex = $scope.model.allowedContentTypes.indexOf(selectedChild.id);
                $scope.model.allowedContentTypes.splice(selectedChildIndex, 1);
            }
            /**
         * Toggle the $scope.model.allowAsRoot value to either true or false
         */
            function toggle() {
                if ($scope.model.allowAsRoot) {
                    $scope.model.allowAsRoot = false;
                    return;
                }
                $scope.model.allowAsRoot = true;
            }
        }
        angular.module('umbraco').controller('Umbraco.Editors.MediaType.PermissionsController', PermissionsController);
    }());
    /**
 * @ngdoc controller
 * @name Umbraco.Editors.Member.CreateController
 * @function
 * 
 * @description
 * The controller for the member creation dialog
 */
    function memberCreateController($scope, $routeParams, memberTypeResource, iconHelper) {
        memberTypeResource.getTypes($scope.currentNode.id).then(function (data) {
            $scope.allowedTypes = iconHelper.formatContentTypeIcons(data);
        });
    }
    angular.module('umbraco').controller('Umbraco.Editors.Member.CreateController', memberCreateController);
    /**
 * @ngdoc controller
 * @name Umbraco.Editors.Member.DeleteController
 * @function
 *
 * @description
 * The controller for deleting content
 */
    function MemberDeleteController($scope, memberResource, treeService, navigationService, editorState, $location, $routeParams) {
        $scope.performDelete = function () {
            //mark it for deletion (used in the UI)
            $scope.currentNode.loading = true;
            memberResource.deleteByKey($scope.currentNode.id).then(function () {
                $scope.currentNode.loading = false;
                treeService.removeNode($scope.currentNode);
                //if the current edited item is the same one as we're deleting, we need to navigate elsewhere
                if (editorState.current && editorState.current.key == $scope.currentNode.id) {
                    $location.path('/member/member/list/' + ($routeParams.listName ? $routeParams.listName : 'all-members'));
                }
                navigationService.hideMenu();
            });
        };
        $scope.cancel = function () {
            navigationService.hideDialog();
        };
    }
    angular.module('umbraco').controller('Umbraco.Editors.Member.DeleteController', MemberDeleteController);
    /**
 * @ngdoc controller
 * @name Umbraco.Editors.Member.EditController
 * @function
 *
 * @description
 * The controller for the member editor
 */
    function MemberEditController($scope, $routeParams, $location, $q, $window, appState, memberResource, entityResource, navigationService, notificationsService, angularHelper, serverValidationManager, contentEditingHelper, fileManager, formHelper, umbModelMapper, editorState, umbRequestHelper, $http) {
        //setup scope vars
        $scope.page = {};
        $scope.page.loading = true;
        $scope.page.menu = {};
        $scope.page.menu.currentSection = appState.getSectionState('currentSection');
        $scope.page.menu.currentNode = null;
        //the editors affiliated node
        $scope.page.nameLocked = false;
        $scope.page.listViewPath = null;
        $scope.page.saveButtonState = 'init';
        $scope.page.exportButton = 'init';
        $scope.busy = false;
        $scope.page.listViewPath = $routeParams.page && $routeParams.listName ? '/member/member/list/' + $routeParams.listName + '?page=' + $routeParams.page : null;
        //build a path to sync the tree with
        function buildTreePath(data) {
            return $routeParams.listName ? '-1,' + $routeParams.listName : '-1';
        }
        if ($routeParams.create) {
            //if there is no doc type specified then we are going to assume that
            // we are not using the umbraco membership provider
            if ($routeParams.doctype) {
                //we are creating so get an empty member item
                memberResource.getScaffold($routeParams.doctype).then(function (data) {
                    $scope.content = data;
                    setHeaderNameState($scope.content);
                    editorState.set($scope.content);
                    $scope.page.loading = false;
                });
            } else {
                memberResource.getScaffold().then(function (data) {
                    $scope.content = data;
                    setHeaderNameState($scope.content);
                    editorState.set($scope.content);
                    $scope.page.loading = false;
                });
            }
        } else {
            //so, we usually refernce all editors with the Int ID, but with members we have
            //a different pattern, adding a route-redirect here to handle this:
            //isNumber doesnt work here since its seen as a string
            //TODO: Why is this here - I don't understand why this would ever be an integer? This will not work when we support non-umbraco membership providers.
            if ($routeParams.id && $routeParams.id.length < 9) {
                entityResource.getById($routeParams.id, 'Member').then(function (entity) {
                    $location.path('/member/member/edit/' + entity.key);
                });
            } else {
                //we are editing so get the content item from the server
                memberResource.getByKey($routeParams.id).then(function (data) {
                    $scope.content = data;
                    setHeaderNameState($scope.content);
                    editorState.set($scope.content);
                    var path = buildTreePath(data);
                    //sync the tree (only for ui purposes)
                    navigationService.syncTree({
                        tree: 'member',
                        path: path.split(',')
                    });
                    //it's the initial load of the editor, we need to get the tree node
                    // from the server so that we can load in the actions menu.
                    umbRequestHelper.resourcePromise($http.get(data.treeNodeUrl), 'Failed to retrieve data for child node ' + data.key).then(function (node) {
                        $scope.page.menu.currentNode = node;
                    });
                    //in one particular special case, after we've created a new item we redirect back to the edit
                    // route but there might be server validation errors in the collection which we need to display
                    // after the redirect, so we will bind all subscriptions which will show the server validation errors
                    // if there are any and then clear them so the collection no longer persists them.
                    serverValidationManager.executeAndClearAllSubscriptions();
                    $scope.page.loading = false;
                });
            }
        }
        function setHeaderNameState(content) {
            if (content.membershipScenario === 0) {
                $scope.page.nameLocked = true;
            }
        }
        $scope.save = function () {
            if (!$scope.busy && formHelper.submitForm({
                    scope: $scope,
                    statusMessage: 'Saving...'
                })) {
                $scope.busy = true;
                $scope.page.saveButtonState = 'busy';
                //anytime a user is changing a member's password without the oldPassword, we are in effect resetting it so we need to set that flag here
                var passwordProp = _.find(contentEditingHelper.getAllProps($scope.content), function (e) {
                    return e.alias === '_umb_password';
                });
                if (passwordProp && passwordProp.value && !passwordProp.value.reset) {
                    //so if the admin is not explicitly resetting the password, flag it for resetting if a new password is being entered
                    passwordProp.value.reset = !passwordProp.value.oldPassword && passwordProp.config.allowManuallyChangingPassword;
                }
                memberResource.save($scope.content, $routeParams.create, fileManager.getFiles()).then(function (data) {
                    formHelper.resetForm({
                        scope: $scope,
                        notifications: data.notifications
                    });
                    contentEditingHelper.handleSuccessfulSave({
                        scope: $scope,
                        savedContent: data,
                        //specify a custom id to redirect to since we want to use the GUID
                        redirectId: data.key,
                        rebindCallback: contentEditingHelper.reBindChangedProperties($scope.content, data)
                    });
                    editorState.set($scope.content);
                    $scope.busy = false;
                    $scope.page.saveButtonState = 'success';
                    var path = buildTreePath(data);
                    //sync the tree (only for ui purposes)
                    navigationService.syncTree({
                        tree: 'member',
                        path: path.split(','),
                        forceReload: true
                    });
                }, function (err) {
                    contentEditingHelper.handleSaveError({
                        redirectOnFailure: false,
                        err: err,
                        rebindCallback: contentEditingHelper.reBindChangedProperties($scope.content, err.data)
                    });
                    editorState.set($scope.content);
                    $scope.busy = false;
                    $scope.page.saveButtonState = 'error';
                });
            } else {
                $scope.busy = false;
            }
        };
        $scope.export = function () {
            var memberKey = $scope.content.key;
            memberResource.exportMemberData(memberKey);
        };
    }
    angular.module('umbraco').controller('Umbraco.Editors.Member.EditController', MemberEditController);
    /**
 * @ngdoc controller
 * @name Umbraco.Editors.Member.ListController
 * @function
 *
 * @description
 * The controller for the member list view
 */
    function MemberListController($scope, $routeParams, $location, $q, $window, appState, memberResource, entityResource, navigationService, notificationsService, angularHelper, serverValidationManager, contentEditingHelper, fileManager, formHelper, umbModelMapper, editorState, localizationService) {
        //setup scope vars
        $scope.currentSection = appState.getSectionState('currentSection');
        $scope.currentNode = null;
        //the editors affiliated node
        $scope.page = {};
        $scope.page.lockedName = true;
        $scope.page.loading = true;
        //we are editing so get the content item from the server
        memberResource.getListNode($routeParams.id).then(function (data) {
            $scope.content = data;
            //translate "All Members"
            if ($scope.content != null && $scope.content.name != null && $scope.content.name.replace(' ', '').toLowerCase() == 'allmembers') {
                localizationService.localize('member_allMembers').then(function (value) {
                    $scope.content.name = value;
                });
            }
            editorState.set($scope.content);
            navigationService.syncTree({
                tree: 'member',
                path: data.path.split(',')
            }).then(function (syncArgs) {
                $scope.currentNode = syncArgs.node;
            });
            //in one particular special case, after we've created a new item we redirect back to the edit
            // route but there might be server validation errors in the collection which we need to display
            // after the redirect, so we will bind all subscriptions which will show the server validation errors
            // if there are any and then clear them so the collection no longer persists them.
            serverValidationManager.executeAndClearAllSubscriptions();
            $scope.page.loading = false;
        });
    }
    angular.module('umbraco').controller('Umbraco.Editors.Member.ListController', MemberListController);
    /**
 * @ngdoc controller
 * @name Umbraco.Editors.MemberType.CreateController
 * @function
 *
 * @description
 * The controller for the member type creation dialog
 */
    function MemberTypesCreateController($scope, $location, navigationService, memberTypeResource, formHelper, appState, localizationService) {
        $scope.model = {
            folderName: '',
            creatingFolder: false
        };
        var node = $scope.dialogOptions.currentNode, localizeCreateFolder = localizationService.localize('defaultdialog_createFolder');
        $scope.showCreateFolder = function () {
            $scope.model.creatingFolder = true;
        };
        $scope.createContainer = function () {
            if (formHelper.submitForm({
                    scope: $scope,
                    formCtrl: this.createFolderForm,
                    statusMessage: localizeCreateFolder
                })) {
                memberTypeResource.createContainer(node.id, $scope.model.folderName).then(function (folderId) {
                    navigationService.hideMenu();
                    var currPath = node.path ? node.path : '-1';
                    navigationService.syncTree({
                        tree: 'membertypes',
                        path: currPath + ',' + folderId,
                        forceReload: true,
                        activate: true
                    });
                    formHelper.resetForm({ scope: $scope });
                    var section = appState.getSectionState('currentSection');
                }, function (err) {
                });
            }
            ;
        };
        $scope.createMemberType = function () {
            $location.search('create', null);
            $location.path('/settings/membertypes/edit/' + node.id).search('create', 'true');
            navigationService.hideMenu();
        };
    }
    angular.module('umbraco').controller('Umbraco.Editors.MemberTypes.CreateController', MemberTypesCreateController);
    /**
 * @ngdoc controller
 * @name Umbraco.Editors.MemberTypes.DeleteController
 * @function
 *
 * @description
 * The controller for deleting member types
 */
    function MemberTypesDeleteController($scope, memberTypeResource, treeService, navigationService) {
        $scope.performDelete = function () {
            //mark it for deletion (used in the UI)
            $scope.currentNode.loading = true;
            memberTypeResource.deleteById($scope.currentNode.id).then(function () {
                $scope.currentNode.loading = false;
                //get the root node before we remove it
                var rootNode = treeService.getTreeRoot($scope.currentNode);
                //TODO: Need to sync tree, etc...
                treeService.removeNode($scope.currentNode);
                navigationService.hideMenu();
            });
        };
        $scope.cancel = function () {
            navigationService.hideDialog();
        };
    }
    angular.module('umbraco').controller('Umbraco.Editors.MemberTypes.DeleteController', MemberTypesDeleteController);
    /**
 * @ngdoc controller
 * @name Umbraco.Editors.MemberType.EditController
 * @function
 *
 * @description
 * The controller for the member type editor
 */
    (function () {
        'use strict';
        function MemberTypesEditController($scope, $rootScope, $routeParams, $log, $filter, memberTypeResource, dataTypeResource, editorState, iconHelper, formHelper, navigationService, contentEditingHelper, notificationsService, $q, localizationService, overlayHelper, contentTypeHelper) {
            var vm = this;
            var localizeSaving = localizationService.localize('general_saving');
            vm.save = save;
            vm.currentNode = null;
            vm.contentType = {};
            vm.page = {};
            vm.page.loading = false;
            vm.page.saveButtonState = 'init';
            vm.page.navigation = [{
                    'name': localizationService.localize('general_design'),
                    'icon': 'icon-document-dashed-line',
                    'view': 'views/membertypes/views/design/design.html',
                    'active': true
                }];
            vm.page.keyboardShortcutsOverview = [{
                    'name': localizationService.localize('shortcuts_shortcut'),
                    'shortcuts': [
                        {
                            'description': localizationService.localize('shortcuts_addTab'),
                            'keys': [
                                { 'key': 'alt' },
                                { 'key': 'shift' },
                                { 'key': 't' }
                            ]
                        },
                        {
                            'description': localizationService.localize('shortcuts_addProperty'),
                            'keys': [
                                { 'key': 'alt' },
                                { 'key': 'shift' },
                                { 'key': 'p' }
                            ]
                        },
                        {
                            'description': localizationService.localize('shortcuts_addEditor'),
                            'keys': [
                                { 'key': 'alt' },
                                { 'key': 'shift' },
                                { 'key': 'e' }
                            ]
                        },
                        {
                            'description': localizationService.localize('shortcuts_editDataType'),
                            'keys': [
                                { 'key': 'alt' },
                                { 'key': 'shift' },
                                { 'key': 'd' }
                            ]
                        }
                    ]
                }];
            contentTypeHelper.checkModelsBuilderStatus().then(function (result) {
                vm.page.modelsBuilder = result;
                if (result) {
                    //Models builder mode:
                    vm.page.defaultButton = {
                        hotKey: 'ctrl+s',
                        hotKeyWhenHidden: true,
                        labelKey: 'buttons_save',
                        letter: 'S',
                        type: 'submit',
                        handler: function () {
                            vm.save();
                        }
                    };
                    vm.page.subButtons = [{
                            hotKey: 'ctrl+g',
                            hotKeyWhenHidden: true,
                            labelKey: 'buttons_saveAndGenerateModels',
                            letter: 'G',
                            handler: function () {
                                vm.page.saveButtonState = 'busy';
                                vm.save().then(function (result) {
                                    vm.page.saveButtonState = 'busy';
                                    localizationService.localize('modelsBuilder_buildingModels').then(function (headerValue) {
                                        localizationService.localize('modelsBuilder_waitingMessage').then(function (msgValue) {
                                            notificationsService.info(headerValue, msgValue);
                                        });
                                    });
                                    contentTypeHelper.generateModels().then(function (result) {
                                        if (!result.lastError) {
                                            //re-check model status
                                            contentTypeHelper.checkModelsBuilderStatus().then(function (statusResult) {
                                                vm.page.modelsBuilder = statusResult;
                                            });
                                            //clear and add success
                                            vm.page.saveButtonState = 'init';
                                            localizationService.localize('modelsBuilder_modelsGenerated').then(function (value) {
                                                notificationsService.success(value);
                                            });
                                        } else {
                                            vm.page.saveButtonState = 'error';
                                            localizationService.localize('modelsBuilder_modelsExceptionInUlog').then(function (value) {
                                                notificationsService.error(value);
                                            });
                                        }
                                    }, function () {
                                        vm.page.saveButtonState = 'error';
                                        localizationService.localize('modelsBuilder_modelsGeneratedError').then(function (value) {
                                            notificationsService.error(value);
                                        });
                                    });
                                });
                            }
                        }];
                }
            });
            if ($routeParams.create) {
                vm.page.loading = true;
                //we are creating so get an empty data type item
                memberTypeResource.getScaffold($routeParams.id).then(function (dt) {
                    init(dt);
                    vm.page.loading = false;
                });
            } else {
                vm.page.loading = true;
                memberTypeResource.getById($routeParams.id).then(function (dt) {
                    init(dt);
                    syncTreeNode(vm.contentType, dt.path, true);
                    vm.page.loading = false;
                });
            }
            function save() {
                // only save if there is no overlays open
                if (overlayHelper.getNumberOfOverlays() === 0) {
                    var deferred = $q.defer();
                    vm.page.saveButtonState = 'busy';
                    contentEditingHelper.contentEditorPerformSave({
                        statusMessage: localizeSaving,
                        saveMethod: memberTypeResource.save,
                        scope: $scope,
                        content: vm.contentType,
                        //We do not redirect on failure for doc types - this is because it is not possible to actually save the doc
                        // type when server side validation fails - as opposed to content where we are capable of saving the content
                        // item if server side validation fails
                        redirectOnFailure: false,
                        // we need to rebind... the IDs that have been created!
                        rebindCallback: function (origContentType, savedContentType) {
                            vm.contentType.id = savedContentType.id;
                            vm.contentType.groups.forEach(function (group) {
                                if (!group.name)
                                    return;
                                var k = 0;
                                while (k < savedContentType.groups.length && savedContentType.groups[k].name != group.name)
                                    k++;
                                if (k == savedContentType.groups.length) {
                                    group.id = 0;
                                    return;
                                }
                                var savedGroup = savedContentType.groups[k];
                                if (!group.id)
                                    group.id = savedGroup.id;
                                group.properties.forEach(function (property) {
                                    if (property.id || !property.alias)
                                        return;
                                    k = 0;
                                    while (k < savedGroup.properties.length && savedGroup.properties[k].alias != property.alias)
                                        k++;
                                    if (k == savedGroup.properties.length) {
                                        property.id = 0;
                                        return;
                                    }
                                    var savedProperty = savedGroup.properties[k];
                                    property.id = savedProperty.id;
                                });
                            });
                        }
                    }).then(function (data) {
                        //success
                        syncTreeNode(vm.contentType, data.path);
                        vm.page.saveButtonState = 'success';
                        deferred.resolve(data);
                    }, function (err) {
                        //error
                        if (err) {
                            editorState.set($scope.content);
                        } else {
                            localizationService.localize('speechBubbles_validationFailedHeader').then(function (headerValue) {
                                localizationService.localize('speechBubbles_validationFailedMessage').then(function (msgValue) {
                                    notificationsService.error(headerValue, msgValue);
                                });
                            });
                        }
                        vm.page.saveButtonState = 'error';
                        deferred.reject(err);
                    });
                    return deferred.promise;
                }
            }
            function init(contentType) {
                // set all tab to inactive
                if (contentType.groups.length !== 0) {
                    angular.forEach(contentType.groups, function (group) {
                        angular.forEach(group.properties, function (property) {
                            // get data type details for each property
                            getDataTypeDetails(property);
                        });
                    });
                }
                // convert legacy icons
                convertLegacyIcons(contentType);
                //set a shared state
                editorState.set(contentType);
                vm.contentType = contentType;
            }
            function convertLegacyIcons(contentType) {
                // make array to store contentType icon
                var contentTypeArray = [];
                // push icon to array
                contentTypeArray.push({ 'icon': contentType.icon });
                // run through icon method
                iconHelper.formatContentTypeIcons(contentTypeArray);
                // set icon back on contentType
                contentType.icon = contentTypeArray[0].icon;
            }
            function getDataTypeDetails(property) {
                if (property.propertyState !== 'init') {
                    dataTypeResource.getById(property.dataTypeId).then(function (dataType) {
                        property.dataTypeIcon = dataType.icon;
                        property.dataTypeName = dataType.name;
                    });
                }
            }
            /** Syncs the content type  to it's tree node - this occurs on first load and after saving */
            function syncTreeNode(dt, path, initialLoad) {
                navigationService.syncTree({
                    tree: 'membertypes',
                    path: path.split(','),
                    forceReload: initialLoad !== true
                }).then(function (syncArgs) {
                    vm.currentNode = syncArgs.node;
                });
            }
        }
        angular.module('umbraco').controller('Umbraco.Editors.MemberTypes.EditController', MemberTypesEditController);
    }());
    angular.module('umbraco').controller('Umbraco.Editors.MemberTypes.MoveController', function ($scope) {
    });
    /**
 * @ngdoc controller
 * @name Umbraco.Editors.Packages.DeleteController
 * @function
 *
 * @description
 * The controller for deleting content
 */
    function PackageDeleteController($scope, packageResource, treeService, navigationService) {
        $scope.performDelete = function () {
            //mark it for deletion (used in the UI)
            $scope.currentNode.loading = true;
            packageResource.deleteCreatedPackage($scope.currentNode.id).then(function () {
                $scope.currentNode.loading = false;
                //get the root node before we remove it
                var rootNode = treeService.getTreeRoot($scope.currentNode);
                treeService.removeNode($scope.currentNode);
                navigationService.hideMenu();
            });
        };
        $scope.cancel = function () {
            navigationService.hideDialog();
        };
    }
    angular.module('umbraco').controller('Umbraco.Editors.Packages.DeleteController', PackageDeleteController);
    (function () {
        'use strict';
        function PackagesOverviewController($scope, $route, $location, navigationService, $timeout, localStorageService) {
            //Hack!
            // if there is a cookie value for packageInstallUri then we need to redirect there,
            // the issue is that we still have webforms and we cannot go to a hash location and then window.reload
            // because it will double load it.
            // we will refresh and then navigate there.
            var installPackageUri = localStorageService.get('packageInstallUri');
            if (installPackageUri) {
                localStorageService.remove('packageInstallUri');
            }
            if (installPackageUri && installPackageUri !== 'installed') {
                //navigate to the custom installer screen, if it is just "installed", then we'll 
                //show the installed view
                $location.path(installPackageUri).search('');
            } else {
                var vm = this;
                vm.page = {};
                vm.page.name = 'Packages';
                vm.page.navigation = [
                    {
                        'name': 'Packages',
                        'icon': 'icon-cloud',
                        'view': 'views/packager/views/repo.html',
                        'active': !installPackageUri || installPackageUri === 'navigation'
                    },
                    {
                        'name': 'Installed',
                        'icon': 'icon-box',
                        'view': 'views/packager/views/installed.html',
                        'active': installPackageUri === 'installed'
                    },
                    {
                        'name': 'Install local',
                        'icon': 'icon-add',
                        'view': 'views/packager/views/install-local.html',
                        'active': installPackageUri === 'local'
                    }
                ];
                $timeout(function () {
                    navigationService.syncTree({
                        tree: 'packager',
                        path: '-1'
                    });
                });
            }
        }
        angular.module('umbraco').controller('Umbraco.Editors.Packages.OverviewController', PackagesOverviewController);
    }());
    (function () {
        'use strict';
        function PackagesInstallLocalController($scope, $route, $location, Upload, umbRequestHelper, packageResource, localStorageService, $timeout, $window, localizationService, $q) {
            var vm = this;
            vm.state = 'upload';
            vm.localPackage = {};
            vm.installPackage = installPackage;
            vm.installState = {
                status: '',
                progress: 0
            };
            vm.installCompleted = false;
            vm.zipFile = {
                uploadStatus: 'idle',
                uploadProgress: 0,
                serverErrorMessage: null
            };
            $scope.handleFiles = function (files, event) {
                if (files) {
                    for (var i = 0; i < files.length; i++) {
                        upload(files[i]);
                    }
                }
            };
            function upload(file) {
                Upload.upload({
                    url: umbRequestHelper.getApiUrl('packageInstallApiBaseUrl', 'UploadLocalPackage'),
                    fields: {},
                    file: file
                }).progress(function (evt) {
                    // hack: in some browsers the progress event is called after success
                    // this prevents the UI from going back to a uploading state
                    if (vm.zipFile.uploadStatus !== 'done' && vm.zipFile.uploadStatus !== 'error') {
                        // set view state to uploading
                        vm.state = 'uploading';
                        // calculate progress in percentage
                        var progressPercentage = parseInt(100 * evt.loaded / evt.total, 10);
                        // set percentage property on file
                        vm.zipFile.uploadProgress = progressPercentage;
                        // set uploading status on file
                        vm.zipFile.uploadStatus = 'uploading';
                    }
                }).success(function (data, status, headers, config) {
                    if (data.notifications && data.notifications.length > 0) {
                        // set error status on file
                        vm.zipFile.uploadStatus = 'error';
                        // Throw message back to user with the cause of the error
                        vm.zipFile.serverErrorMessage = data.notifications[0].message;
                    } else {
                        // set done status on file
                        vm.zipFile.uploadStatus = 'done';
                        loadPackage();
                        vm.zipFile.uploadProgress = 100;
                        vm.localPackage = data;
                    }
                }).error(function (evt, status, headers, config) {
                    // set status done
                    vm.zipFile.uploadStatus = 'error';
                    // If file not found, server will return a 404 and display this message
                    if (status === 404) {
                        vm.zipFile.serverErrorMessage = 'File not found';
                    } else if (status == 400) {
                        //it's a validation error
                        vm.zipFile.serverErrorMessage = evt.message;
                    } else {
                        //it's an unhandled error
                        //if the service returns a detailed error
                        if (evt.InnerException) {
                            vm.zipFile.serverErrorMessage = evt.InnerException.ExceptionMessage;
                            //Check if its the common "too large file" exception
                            if (evt.InnerException.StackTrace && evt.InnerException.StackTrace.indexOf('ValidateRequestEntityLength') > 0) {
                                vm.zipFile.serverErrorMessage = 'File too large to upload';
                            }
                        } else if (evt.Message) {
                            vm.zipFile.serverErrorMessage = evt.Message;
                        }
                    }
                });
            }
            function loadPackage() {
                if (vm.zipFile.uploadStatus === 'done') {
                    vm.state = 'packageDetails';
                }
            }
            function installPackage() {
                vm.installState.status = localizationService.localize('packager_installStateImporting');
                vm.installState.progress = '0';
                packageResource.import(vm.localPackage).then(function (pack) {
                    vm.installState.progress = '25';
                    vm.installState.status = localizationService.localize('packager_installStateInstalling');
                    return packageResource.installFiles(pack);
                }, installError).then(function (pack) {
                    vm.installState.status = localizationService.localize('packager_installStateRestarting');
                    vm.installState.progress = '50';
                    var deferred = $q.defer();
                    //check if the app domain is restarted ever 2 seconds
                    var count = 0;
                    function checkRestart() {
                        $timeout(function () {
                            packageResource.checkRestart(pack).then(function (d) {
                                count++;
                                //if there is an id it means it's not restarted yet but we'll limit it to only check 10 times
                                if (d.isRestarting && count < 10) {
                                    checkRestart();
                                } else {
                                    //it's restarted!
                                    deferred.resolve(d);
                                }
                            }, installError);
                        }, 2000);
                    }
                    checkRestart();
                    return deferred.promise;
                }, installError).then(function (pack) {
                    vm.installState.status = localizationService.localize('packager_installStateRestarting');
                    vm.installState.progress = '75';
                    return packageResource.installData(pack);
                }, installError).then(function (pack) {
                    vm.installState.status = localizationService.localize('packager_installStateComplete');
                    vm.installState.progress = '100';
                    return packageResource.cleanUp(pack);
                }, installError).then(function (result) {
                    if (result.postInstallationPath) {
                        //Put the redirect Uri in a cookie so we can use after reloading
                        localStorageService.set('packageInstallUri', result.postInstallationPath);
                    } else {
                        //set to a constant value so it knows to just go to the installed view
                        localStorageService.set('packageInstallUri', 'installed');
                    }
                    vm.installState.status = localizationService.localize('packager_installStateCompleted');
                    vm.installCompleted = true;
                }, installError);
            }
            function installError() {
                //This will return a rejection meaning that the promise change above will stop
                return $q.reject();
            }
            vm.reloadPage = function () {
                //reload on next digest (after cookie)
                $timeout(function () {
                    $window.location.reload(true);
                });
            };
        }
        angular.module('umbraco').controller('Umbraco.Editors.Packages.InstallLocalController', PackagesInstallLocalController);
    }());
    (function () {
        'use strict';
        function PackagesInstalledController($scope, $route, $location, packageResource, $timeout, $window, localStorageService, localizationService) {
            var vm = this;
            vm.confirmUninstall = confirmUninstall;
            vm.uninstallPackage = uninstallPackage;
            vm.state = 'list';
            vm.installState = { status: '' };
            vm.package = {};
            function init() {
                packageResource.getInstalled().then(function (packs) {
                    vm.installedPackages = packs;
                });
                vm.installState.status = '';
                vm.state = 'list';
            }
            function confirmUninstall(pck) {
                vm.state = 'packageDetails';
                vm.package = pck;
            }
            function uninstallPackage(installedPackage) {
                vm.installState.status = localizationService.localize('packager_installStateUninstalling');
                vm.installState.progress = '0';
                packageResource.uninstall(installedPackage.id).then(function () {
                    if (installedPackage.files.length > 0) {
                        vm.installState.status = localizationService.localize('packager_installStateComplete');
                        vm.installState.progress = '100';
                        //set this flag so that on refresh it shows the installed packages list
                        localStorageService.set('packageInstallUri', 'installed');
                        //reload on next digest (after cookie)
                        $timeout(function () {
                            $window.location.reload(true);
                        });
                    } else {
                        init();
                    }
                });
            }
            init();
        }
        angular.module('umbraco').controller('Umbraco.Editors.Packages.InstalledController', PackagesInstalledController);
    }());
    (function () {
        'use strict';
        function PackagesRepoController($scope, $route, $location, $timeout, ourPackageRepositoryResource, $q, packageResource, localStorageService, localizationService) {
            var vm = this;
            vm.packageViewState = 'packageList';
            vm.categories = [];
            vm.loading = true;
            vm.pagination = {
                pageNumber: 1,
                totalPages: 10,
                pageSize: 24
            };
            vm.searchQuery = '';
            vm.installState = {
                status: '',
                progress: 0,
                type: 'ok'
            };
            vm.selectCategory = selectCategory;
            vm.showPackageDetails = showPackageDetails;
            vm.setPackageViewState = setPackageViewState;
            vm.nextPage = nextPage;
            vm.prevPage = prevPage;
            vm.goToPage = goToPage;
            vm.installPackage = installPackage;
            vm.downloadPackage = downloadPackage;
            vm.openLightbox = openLightbox;
            vm.closeLightbox = closeLightbox;
            vm.search = search;
            vm.installCompleted = false;
            var currSort = 'Latest';
            //used to cancel any request in progress if another one needs to take it's place
            var canceler = null;
            function getActiveCategory() {
                if (vm.searchQuery !== '') {
                    return '';
                }
                for (var i = 0; i < vm.categories.length; i++) {
                    if (vm.categories[i].active === true) {
                        return vm.categories[i].name;
                    }
                }
                return '';
            }
            function init() {
                vm.loading = true;
                $q.all([
                    ourPackageRepositoryResource.getCategories().then(function (cats) {
                        vm.categories = cats;
                    }),
                    ourPackageRepositoryResource.getPopular(8).then(function (pack) {
                        vm.popular = pack.packages;
                    }),
                    ourPackageRepositoryResource.search(vm.pagination.pageNumber - 1, vm.pagination.pageSize, currSort).then(function (pack) {
                        vm.packages = pack.packages;
                        vm.pagination.totalPages = Math.ceil(pack.total / vm.pagination.pageSize);
                    })
                ]).then(function () {
                    vm.loading = false;
                });
            }
            function selectCategory(selectedCategory, categories) {
                var reset = false;
                for (var i = 0; i < categories.length; i++) {
                    var category = categories[i];
                    if (category.name === selectedCategory.name && category.active === true) {
                        //it's already selected, let's unselect to show all again
                        reset = true;
                    }
                    category.active = false;
                }
                vm.loading = true;
                vm.searchQuery = '';
                var searchCategory = selectedCategory.name;
                if (reset === true) {
                    searchCategory = '';
                }
                currSort = 'Latest';
                $q.all([
                    ourPackageRepositoryResource.getPopular(8, searchCategory).then(function (pack) {
                        vm.popular = pack.packages;
                    }),
                    ourPackageRepositoryResource.search(vm.pagination.pageNumber - 1, vm.pagination.pageSize, currSort, searchCategory, vm.searchQuery).then(function (pack) {
                        vm.packages = pack.packages;
                        vm.pagination.totalPages = Math.ceil(pack.total / vm.pagination.pageSize);
                        vm.pagination.pageNumber = 1;
                    })
                ]).then(function () {
                    vm.loading = false;
                    selectedCategory.active = reset === false;
                });
            }
            function showPackageDetails(selectedPackage) {
                ourPackageRepositoryResource.getDetails(selectedPackage.id).then(function (pack) {
                    packageResource.validateInstalled(pack.name, pack.latestVersion).then(function () {
                        //ok, can install
                        vm.package = pack;
                        vm.package.isValid = true;
                        vm.packageViewState = 'packageDetails';
                    }, function () {
                        //nope, cannot install
                        vm.package = pack;
                        vm.package.isValid = false;
                        vm.packageViewState = 'packageDetails';
                    });
                });
            }
            function setPackageViewState(state) {
                if (state) {
                    vm.packageViewState = state;
                }
            }
            function nextPage(pageNumber) {
                ourPackageRepositoryResource.search(pageNumber - 1, vm.pagination.pageSize, currSort, getActiveCategory(), vm.searchQuery).then(function (pack) {
                    vm.packages = pack.packages;
                    vm.pagination.totalPages = Math.ceil(pack.total / vm.pagination.pageSize);
                });
            }
            function prevPage(pageNumber) {
                ourPackageRepositoryResource.search(pageNumber - 1, vm.pagination.pageSize, currSort, getActiveCategory(), vm.searchQuery).then(function (pack) {
                    vm.packages = pack.packages;
                    vm.pagination.totalPages = Math.ceil(pack.total / vm.pagination.pageSize);
                });
            }
            function goToPage(pageNumber) {
                ourPackageRepositoryResource.search(pageNumber - 1, vm.pagination.pageSize, currSort, getActiveCategory(), vm.searchQuery).then(function (pack) {
                    vm.packages = pack.packages;
                    vm.pagination.totalPages = Math.ceil(pack.total / vm.pagination.pageSize);
                });
            }
            function downloadPackage(selectedPackage) {
                vm.loading = true;
                packageResource.fetch(selectedPackage.id).then(function (pack) {
                    vm.packageViewState = 'packageInstall';
                    vm.loading = false;
                    vm.localPackage = pack;
                    vm.localPackage.allowed = true;
                }, function (evt, status, headers, config) {
                    if (status == 400) {
                        //it's a validation error
                        vm.installState.type = 'error';
                        vm.zipFile.serverErrorMessage = evt.message;
                    }
                });
            }
            function error(e, args) {
                //This will return a rejection meaning that the promise change above will stop
                return $q.reject();
            }
            function installPackage(selectedPackage) {
                vm.installState.status = localizationService.localize('packager_installStateImporting');
                vm.installState.progress = '0';
                packageResource.import(selectedPackage).then(function (pack) {
                    vm.installState.status = localizationService.localize('packager_installStateInstalling');
                    vm.installState.progress = '25';
                    return packageResource.installFiles(pack);
                }, error).then(function (pack) {
                    vm.installState.status = localizationService.localize('packager_installStateRestarting');
                    vm.installState.progress = '50';
                    var deferred = $q.defer();
                    //check if the app domain is restarted ever 2 seconds
                    var count = 0;
                    function checkRestart() {
                        $timeout(function () {
                            packageResource.checkRestart(pack).then(function (d) {
                                count++;
                                //if there is an id it means it's not restarted yet but we'll limit it to only check 10 times
                                if (d.isRestarting && count < 10) {
                                    checkRestart();
                                } else {
                                    //it's restarted!
                                    deferred.resolve(d);
                                }
                            }, error);
                        }, 2000);
                    }
                    checkRestart();
                    return deferred.promise;
                }, error).then(function (pack) {
                    vm.installState.status = localizationService.localize('packager_installStateRestarting');
                    vm.installState.progress = '75';
                    return packageResource.installData(pack);
                }, error).then(function (pack) {
                    vm.installState.status = localizationService.localize('packager_installStateComplete');
                    vm.installState.progress = '100';
                    return packageResource.cleanUp(pack);
                }, error).then(function (result) {
                    if (result.postInstallationPath) {
                        //Put the redirect Uri in a cookie so we can use after reloading
                        localStorageService.set('packageInstallUri', result.postInstallationPath);
                    }
                    vm.installState.status = localizationService.localize('packager_installStateCompleted');
                    vm.installCompleted = true;
                }, error);
            }
            function openLightbox(itemIndex, items) {
                vm.lightbox = {
                    show: true,
                    items: items,
                    activeIndex: itemIndex
                };
            }
            function closeLightbox() {
                vm.lightbox.show = false;
                vm.lightbox = null;
            }
            var searchDebounced = _.debounce(function (e) {
                $scope.$apply(function () {
                    //a canceler exists, so perform the cancelation operation and reset
                    if (canceler) {
                        canceler.resolve();
                        canceler = $q.defer();
                    } else {
                        canceler = $q.defer();
                    }
                    currSort = vm.searchQuery ? 'Default' : 'Latest';
                    ourPackageRepositoryResource.search(vm.pagination.pageNumber - 1, vm.pagination.pageSize, currSort, '', vm.searchQuery, canceler).then(function (pack) {
                        vm.packages = pack.packages;
                        vm.pagination.totalPages = Math.ceil(pack.total / vm.pagination.pageSize);
                        vm.pagination.pageNumber = 1;
                        vm.loading = false;
                        //set back to null so it can be re-created
                        canceler = null;
                    });
                });
            }, 200);
            function search(searchQuery) {
                vm.loading = true;
                searchDebounced();
            }
            vm.reloadPage = function () {
                //reload on next digest (after cookie)
                $timeout(function () {
                    window.location.reload(true);
                });
            };
            init();
        }
        angular.module('umbraco').controller('Umbraco.Editors.Packages.RepoController', PackagesRepoController);
    }());
    (function () {
        'use strict';
        function PartialViewMacrosCreateController($scope, codefileResource, macroResource, $location, navigationService, formHelper, localizationService, appState) {
            var vm = this;
            var node = $scope.dialogOptions.currentNode;
            var localizeCreateFolder = localizationService.localize('defaultdialog_createFolder');
            vm.snippets = [];
            vm.createFolderError = '';
            vm.folderName = '';
            vm.fileName = '';
            vm.showSnippets = false;
            vm.creatingFolder = false;
            vm.showCreateFolder = showCreateFolder;
            vm.createFolder = createFolder;
            vm.createFile = createFile;
            vm.createFileWithoutMacro = createFileWithoutMacro;
            vm.showCreateFromSnippet = showCreateFromSnippet;
            vm.createFileFromSnippet = createFileFromSnippet;
            function onInit() {
                codefileResource.getSnippets('partialViewMacros').then(function (snippets) {
                    vm.snippets = snippets;
                });
            }
            function showCreateFolder() {
                vm.creatingFolder = true;
            }
            function createFolder(form) {
                if (formHelper.submitForm({
                        scope: $scope,
                        formCtrl: form,
                        statusMessage: localizeCreateFolder
                    })) {
                    codefileResource.createContainer('partialViewMacros', node.id, vm.folderName).then(function (saved) {
                        navigationService.hideMenu();
                        navigationService.syncTree({
                            tree: 'partialViewMacros',
                            path: saved.path,
                            forceReload: true,
                            activate: true
                        });
                        formHelper.resetForm({ scope: $scope });
                        var section = appState.getSectionState('currentSection');
                    }, function (err) {
                        vm.createFolderError = err;
                        //show any notifications
                        formHelper.showNotifications(err.data);
                    });
                }
            }
            function createFile() {
                $location.path('/developer/partialviewmacros/edit/' + node.id).search('create', 'true');
                navigationService.hideMenu();
            }
            function createFileWithoutMacro() {
                $location.path('/developer/partialviewmacros/edit/' + node.id).search('create', 'true').search('nomacro', 'true');
                navigationService.hideMenu();
            }
            function createFileFromSnippet(snippet) {
                $location.path('/developer/partialviewmacros/edit/' + node.id).search('create', 'true').search('snippet', snippet.fileName);
                navigationService.hideMenu();
            }
            function showCreateFromSnippet() {
                vm.showSnippets = true;
            }
            onInit();
        }
        angular.module('umbraco').controller('Umbraco.Editors.PartialViewMacros.CreateController', PartialViewMacrosCreateController);
    }());
    /**
 * @ngdoc controller
 * @name Umbraco.Editors.PartialViewMacros.DeleteController
 * @function
 *
 * @description
 * The controller for deleting partial view macros
 */
    function PartialViewMacrosDeleteController($scope, codefileResource, treeService, navigationService) {
        $scope.performDelete = function () {
            //mark it for deletion (used in the UI)
            $scope.currentNode.loading = true;
            codefileResource.deleteByPath('partialViewMacros', $scope.currentNode.id).then(function () {
                $scope.currentNode.loading = false;
                //get the root node before we remove it
                var rootNode = treeService.getTreeRoot($scope.currentNode);
                //TODO: Need to sync tree, etc...
                treeService.removeNode($scope.currentNode);
                navigationService.hideMenu();
            });
        };
        $scope.cancel = function () {
            navigationService.hideDialog();
        };
    }
    angular.module('umbraco').controller('Umbraco.Editors.PartialViewMacros.DeleteController', PartialViewMacrosDeleteController);
    (function () {
        'use strict';
        function partialViewMacrosEditController($scope, $routeParams, codefileResource, assetsService, notificationsService, editorState, navigationService, appState, macroService, angularHelper, $timeout, contentEditingHelper, localizationService, templateHelper, macroResource) {
            var vm = this;
            var localizeSaving = localizationService.localize('general_saving');
            vm.page = {};
            vm.page.loading = true;
            vm.partialViewMacroFile = {};
            //menu
            vm.page.menu = {};
            vm.page.menu.currentSection = appState.getSectionState('currentSection');
            vm.page.menu.currentNode = null;
            // bind functions to view model
            vm.save = save;
            vm.openPageFieldOverlay = openPageFieldOverlay;
            vm.openDictionaryItemOverlay = openDictionaryItemOverlay;
            vm.openQueryBuilderOverlay = openQueryBuilderOverlay;
            vm.openMacroOverlay = openMacroOverlay;
            vm.openInsertOverlay = openInsertOverlay;
            /* Functions bound to view model */
            function save() {
                vm.page.saveButtonState = 'busy';
                vm.partialViewMacro.content = vm.editor.getValue();
                contentEditingHelper.contentEditorPerformSave({
                    statusMessage: localizeSaving,
                    saveMethod: codefileResource.save,
                    scope: $scope,
                    content: vm.partialViewMacro,
                    // We do not redirect on failure for partial view macros - this is because it is not possible to actually save the partial view
                    // when server side validation fails - as opposed to content where we are capable of saving the content
                    // item if server side validation fails
                    redirectOnFailure: false,
                    rebindCallback: function (orignal, saved) {
                    }
                }).then(function (saved) {
                    // create macro if needed
                    if ($routeParams.create && $routeParams.nomacro !== 'true') {
                        macroResource.createPartialViewMacroWithFile(saved.virtualPath, saved.name).then(function (created) {
                            completeSave(saved);
                        }, function (err) {
                            //show any notifications
                            formHelper.showNotifications(err.data);
                        });
                    } else {
                        completeSave(saved);
                    }
                }, function (err) {
                    vm.page.saveButtonState = 'error';
                    localizationService.localize('speechBubbles_validationFailedHeader').then(function (headerValue) {
                        localizationService.localize('speechBubbles_validationFailedMessage').then(function (msgValue) {
                            notificationsService.error(headerValue, msgValue);
                        });
                    });
                });
            }
            function completeSave(saved) {
                localizationService.localize('speechBubbles_partialViewSavedHeader').then(function (headerValue) {
                    localizationService.localize('speechBubbles_partialViewSavedText').then(function (msgValue) {
                        notificationsService.success(headerValue, msgValue);
                    });
                });
                //check if the name changed, if so we need to redirect
                if (vm.partialViewMacro.id !== saved.id) {
                    contentEditingHelper.redirectToRenamedContent(saved.id);
                } else {
                    vm.page.saveButtonState = 'success';
                    vm.partialViewMacro = saved;
                    //sync state
                    editorState.set(vm.partialViewMacro);
                    // normal tree sync
                    navigationService.syncTree({
                        tree: 'partialViewMacros',
                        path: vm.partialViewMacro.path,
                        forceReload: true
                    }).then(function (syncArgs) {
                        vm.page.menu.currentNode = syncArgs.node;
                    });
                    // clear $dirty state on form
                    setFormState('pristine');
                }
            }
            function openInsertOverlay() {
                vm.insertOverlay = {
                    view: 'insert',
                    allowedTypes: {
                        macro: true,
                        dictionary: true,
                        umbracoField: true
                    },
                    hideSubmitButton: true,
                    show: true,
                    submit: function (model) {
                        switch (model.insert.type) {
                        case 'macro':
                            var macroObject = macroService.collectValueData(model.insert.selectedMacro, model.insert.macroParams, 'Mvc');
                            insert(macroObject.syntax);
                            break;
                        case 'dictionary':
                            var code = templateHelper.getInsertDictionarySnippet(model.insert.node.name);
                            insert(code);
                            break;
                        case 'umbracoField':
                            insert(model.insert.umbracoField);
                            break;
                        }
                        vm.insertOverlay.show = false;
                        vm.insertOverlay = null;
                    },
                    close: function (oldModel) {
                        // close the dialog
                        vm.insertOverlay.show = false;
                        vm.insertOverlay = null;
                        // focus editor
                        vm.editor.focus();
                    }
                };
            }
            function openMacroOverlay() {
                vm.macroPickerOverlay = {
                    view: 'macropicker',
                    dialogData: {},
                    show: true,
                    title: 'Insert macro',
                    submit: function (model) {
                        var macroObject = macroService.collectValueData(model.selectedMacro, model.macroParams, 'Mvc');
                        insert(macroObject.syntax);
                        vm.macroPickerOverlay.show = false;
                        vm.macroPickerOverlay = null;
                    },
                    close: function (oldModel) {
                        // close the dialog
                        vm.macroPickerOverlay.show = false;
                        vm.macroPickerOverlay = null;
                        // focus editor
                        vm.editor.focus();
                    }
                };
            }
            function openPageFieldOverlay() {
                vm.pageFieldOverlay = {
                    submitButtonLabel: 'Insert',
                    closeButtonlabel: 'Cancel',
                    view: 'insertfield',
                    show: true,
                    submit: function (model) {
                        insert(model.umbracoField);
                        vm.pageFieldOverlay.show = false;
                        vm.pageFieldOverlay = null;
                    },
                    close: function (model) {
                        // close the dialog
                        vm.pageFieldOverlay.show = false;
                        vm.pageFieldOverlay = null;
                        // focus editor
                        vm.editor.focus();
                    }
                };
            }
            function openDictionaryItemOverlay() {
                vm.dictionaryItemOverlay = {
                    view: 'treepicker',
                    section: 'settings',
                    treeAlias: 'dictionary',
                    entityType: 'dictionary',
                    multiPicker: false,
                    show: true,
                    title: 'Insert dictionary item',
                    emptyStateMessage: localizationService.localize('emptyStates_emptyDictionaryTree'),
                    select: function (node) {
                        var code = templateHelper.getInsertDictionarySnippet(node.name);
                        insert(code);
                        vm.dictionaryItemOverlay.show = false;
                        vm.dictionaryItemOverlay = null;
                    },
                    close: function (model) {
                        // close dialog
                        vm.dictionaryItemOverlay.show = false;
                        vm.dictionaryItemOverlay = null;
                        // focus editor
                        vm.editor.focus();
                    }
                };
            }
            function openQueryBuilderOverlay() {
                vm.queryBuilderOverlay = {
                    view: 'querybuilder',
                    show: true,
                    title: 'Query for content',
                    submit: function (model) {
                        var code = templateHelper.getQuerySnippet(model.result.queryExpression);
                        insert(code);
                        vm.queryBuilderOverlay.show = false;
                        vm.queryBuilderOverlay = null;
                    },
                    close: function (model) {
                        // close dialog
                        vm.queryBuilderOverlay.show = false;
                        vm.queryBuilderOverlay = null;
                        // focus editor
                        vm.editor.focus();
                    }
                };
            }
            /* Local functions */
            function init() {
                //we need to load this somewhere, for now its here.
                assetsService.loadCss('lib/ace-razor-mode/theme/razor_chrome.css', $scope);
                if ($routeParams.create) {
                    var snippet = 'Empty';
                    if ($routeParams.snippet) {
                        snippet = $routeParams.snippet;
                    }
                    codefileResource.getScaffold('partialViewMacros', $routeParams.id, snippet).then(function (partialViewMacro) {
                        if ($routeParams.name) {
                            partialViewMacro.name = $routeParams.name;
                        }
                        ready(partialViewMacro, false);
                    });
                } else {
                    codefileResource.getByPath('partialViewMacros', $routeParams.id).then(function (partialViewMacro) {
                        ready(partialViewMacro, true);
                    });
                }
            }
            function ready(partialViewMacro, syncTree) {
                vm.page.loading = false;
                vm.partialViewMacro = partialViewMacro;
                //sync state
                editorState.set(vm.partialViewMacro);
                if (syncTree) {
                    navigationService.syncTree({
                        tree: 'partialViewMacros',
                        path: vm.partialViewMacro.path,
                        forceReload: true
                    }).then(function (syncArgs) {
                        vm.page.menu.currentNode = syncArgs.node;
                    });
                }
                // ace configuration
                vm.aceOption = {
                    mode: 'razor',
                    theme: 'chrome',
                    showPrintMargin: false,
                    advanced: { fontSize: '14px' },
                    onLoad: function (_editor) {
                        vm.editor = _editor;
                        // initial cursor placement
                        // Keep cursor in name field if we are create a new template
                        // else set the cursor at the bottom of the code editor
                        if (!$routeParams.create) {
                            $timeout(function () {
                                vm.editor.navigateFileEnd();
                                vm.editor.focus();
                                persistCurrentLocation();
                            });
                        }
                        //change on blur, focus
                        vm.editor.on('blur', persistCurrentLocation);
                        vm.editor.on('focus', persistCurrentLocation);
                        vm.editor.on('change', changeAceEditor);
                    }
                };
            }
            function insert(str) {
                vm.editor.focus();
                vm.editor.moveCursorToPosition(vm.currentPosition);
                vm.editor.insert(str);
                // set form state to $dirty
                setFormState('dirty');
            }
            function persistCurrentLocation() {
                vm.currentPosition = vm.editor.getCursorPosition();
            }
            function changeAceEditor() {
                setFormState('dirty');
            }
            function setFormState(state) {
                // get the current form
                var currentForm = angularHelper.getCurrentForm($scope);
                // set state
                if (state === 'dirty') {
                    currentForm.$setDirty();
                } else if (state === 'pristine') {
                    currentForm.$setPristine();
                }
            }
            init();
        }
        angular.module('umbraco').controller('Umbraco.Editors.PartialViewMacros.EditController', partialViewMacrosEditController);
    }());
    (function () {
        'use strict';
        function PartialViewsCreateController($scope, codefileResource, $location, navigationService, formHelper, localizationService, appState) {
            var vm = this;
            var node = $scope.dialogOptions.currentNode;
            var localizeCreateFolder = localizationService.localize('defaultdialog_createFolder');
            vm.snippets = [];
            vm.showSnippets = false;
            vm.creatingFolder = false;
            vm.createFolderError = '';
            vm.folderName = '';
            vm.createPartialView = createPartialView;
            vm.showCreateFolder = showCreateFolder;
            vm.createFolder = createFolder;
            vm.showCreateFromSnippet = showCreateFromSnippet;
            function onInit() {
                codefileResource.getSnippets('partialViews').then(function (snippets) {
                    vm.snippets = snippets;
                });
            }
            function createPartialView(selectedSnippet) {
                var snippet = null;
                if (selectedSnippet && selectedSnippet.fileName) {
                    snippet = selectedSnippet.fileName;
                }
                $location.path('/settings/partialviews/edit/' + node.id).search('create', 'true').search('snippet', snippet);
                navigationService.hideMenu();
            }
            function showCreateFolder() {
                vm.creatingFolder = true;
            }
            function createFolder(form) {
                if (formHelper.submitForm({
                        scope: $scope,
                        formCtrl: form,
                        statusMessage: localizeCreateFolder
                    })) {
                    codefileResource.createContainer('partialViews', node.id, vm.folderName).then(function (saved) {
                        navigationService.hideMenu();
                        navigationService.syncTree({
                            tree: 'partialViews',
                            path: saved.path,
                            forceReload: true,
                            activate: true
                        });
                        formHelper.resetForm({ scope: $scope });
                        var section = appState.getSectionState('currentSection');
                    }, function (err) {
                        vm.createFolderError = err;
                        formHelper.showNotifications(err.data);
                    });
                }
            }
            function showCreateFromSnippet() {
                vm.showSnippets = true;
            }
            onInit();
        }
        angular.module('umbraco').controller('Umbraco.Editors.PartialViews.CreateController', PartialViewsCreateController);
    }());
    /**
 * @ngdoc controller
 * @name Umbraco.Editors.PartialViews.DeleteController
 * @function
 *
 * @description
 * The controller for deleting partial views
 */
    function PartialViewsDeleteController($scope, codefileResource, treeService, navigationService) {
        $scope.performDelete = function () {
            //mark it for deletion (used in the UI)
            $scope.currentNode.loading = true;
            // Reset the error message
            $scope.error = null;
            codefileResource.deleteByPath('partialViews', $scope.currentNode.id).then(function () {
                $scope.currentNode.loading = false;
                //get the root node before we remove it
                var rootNode = treeService.getTreeRoot($scope.currentNode);
                //TODO: Need to sync tree, etc...
                treeService.removeNode($scope.currentNode);
                navigationService.hideMenu();
            }, function (err) {
                $scope.currentNode.loading = false;
                $scope.error = err;
            });
        };
        $scope.cancel = function () {
            navigationService.hideDialog();
        };
    }
    angular.module('umbraco').controller('Umbraco.Editors.PartialViews.DeleteController', PartialViewsDeleteController);
    (function () {
        'use strict';
        function PartialViewsEditController($scope, $routeParams, codefileResource, assetsService, notificationsService, editorState, navigationService, appState, macroService, angularHelper, $timeout, contentEditingHelper, localizationService, templateHelper) {
            var vm = this;
            var localizeSaving = localizationService.localize('general_saving');
            vm.page = {};
            vm.page.loading = true;
            vm.partialView = {};
            //menu
            vm.page.menu = {};
            vm.page.menu.currentSection = appState.getSectionState('currentSection');
            vm.page.menu.currentNode = null;
            //Used to toggle the keyboard shortcut modal
            //From a custom keybinding in ace editor - that conflicts with our own to show the dialog
            vm.showKeyboardShortcut = false;
            //Keyboard shortcuts for help dialog
            vm.page.keyboardShortcutsOverview = [];
            vm.page.keyboardShortcutsOverview.push(templateHelper.getGeneralShortcuts());
            vm.page.keyboardShortcutsOverview.push(templateHelper.getEditorShortcuts());
            vm.page.keyboardShortcutsOverview.push(templateHelper.getPartialViewEditorShortcuts());
            // bind functions to view model
            vm.save = save;
            vm.openPageFieldOverlay = openPageFieldOverlay;
            vm.openDictionaryItemOverlay = openDictionaryItemOverlay;
            vm.openQueryBuilderOverlay = openQueryBuilderOverlay;
            vm.openMacroOverlay = openMacroOverlay;
            vm.openInsertOverlay = openInsertOverlay;
            /* Functions bound to view model */
            function save() {
                vm.page.saveButtonState = 'busy';
                vm.partialView.content = vm.editor.getValue();
                contentEditingHelper.contentEditorPerformSave({
                    statusMessage: localizeSaving,
                    saveMethod: codefileResource.save,
                    scope: $scope,
                    content: vm.partialView,
                    //We do not redirect on failure for partialviews - this is because it is not possible to actually save the partialviews
                    // type when server side validation fails - as opposed to content where we are capable of saving the content
                    // item if server side validation fails
                    redirectOnFailure: false,
                    rebindCallback: function (orignal, saved) {
                    }
                }).then(function (saved) {
                    localizationService.localize('speechBubbles_partialViewSavedHeader').then(function (headerValue) {
                        localizationService.localize('speechBubbles_partialViewSavedText').then(function (msgValue) {
                            notificationsService.success(headerValue, msgValue);
                        });
                    });
                    //check if the name changed, if so we need to redirect
                    if (vm.partialView.id !== saved.id) {
                        contentEditingHelper.redirectToRenamedContent(saved.id);
                    } else {
                        vm.page.saveButtonState = 'success';
                        vm.partialView = saved;
                        //sync state
                        editorState.set(vm.partialView);
                        // normal tree sync
                        navigationService.syncTree({
                            tree: 'partialViews',
                            path: vm.partialView.path,
                            forceReload: true
                        }).then(function (syncArgs) {
                            vm.page.menu.currentNode = syncArgs.node;
                        });
                        // clear $dirty state on form
                        setFormState('pristine');
                    }
                }, function (err) {
                    vm.page.saveButtonState = 'error';
                    localizationService.localize('speechBubbles_validationFailedHeader').then(function (headerValue) {
                        localizationService.localize('speechBubbles_validationFailedMessage').then(function (msgValue) {
                            notificationsService.error(headerValue, msgValue);
                        });
                    });
                });
            }
            function openInsertOverlay() {
                vm.insertOverlay = {
                    view: 'insert',
                    allowedTypes: {
                        macro: true,
                        dictionary: true,
                        umbracoField: true
                    },
                    hideSubmitButton: true,
                    show: true,
                    submit: function (model) {
                        switch (model.insert.type) {
                        case 'macro':
                            var macroObject = macroService.collectValueData(model.insert.selectedMacro, model.insert.macroParams, 'Mvc');
                            insert(macroObject.syntax);
                            break;
                        case 'dictionary':
                            var code = templateHelper.getInsertDictionarySnippet(model.insert.node.name);
                            insert(code);
                            break;
                        case 'umbracoField':
                            insert(model.insert.umbracoField);
                            break;
                        }
                        vm.insertOverlay.show = false;
                        vm.insertOverlay = null;
                    },
                    close: function (oldModel) {
                        // close the dialog
                        vm.insertOverlay.show = false;
                        vm.insertOverlay = null;
                        // focus editor
                        vm.editor.focus();
                    }
                };
            }
            function openMacroOverlay() {
                vm.macroPickerOverlay = {
                    view: 'macropicker',
                    dialogData: {},
                    show: true,
                    title: 'Insert macro',
                    submit: function (model) {
                        var macroObject = macroService.collectValueData(model.selectedMacro, model.macroParams, 'Mvc');
                        insert(macroObject.syntax);
                        vm.macroPickerOverlay.show = false;
                        vm.macroPickerOverlay = null;
                    },
                    close: function (oldModel) {
                        // close the dialog
                        vm.macroPickerOverlay.show = false;
                        vm.macroPickerOverlay = null;
                        // focus editor
                        vm.editor.focus();
                    }
                };
            }
            function openPageFieldOverlay() {
                vm.pageFieldOverlay = {
                    submitButtonLabel: 'Insert',
                    closeButtonlabel: 'Cancel',
                    view: 'insertfield',
                    show: true,
                    submit: function (model) {
                        insert(model.umbracoField);
                        vm.pageFieldOverlay.show = false;
                        vm.pageFieldOverlay = null;
                    },
                    close: function (model) {
                        // close the dialog
                        vm.pageFieldOverlay.show = false;
                        vm.pageFieldOverlay = null;
                        // focus editor
                        vm.editor.focus();
                    }
                };
            }
            function openDictionaryItemOverlay() {
                vm.dictionaryItemOverlay = {
                    view: 'treepicker',
                    section: 'settings',
                    treeAlias: 'dictionary',
                    entityType: 'dictionary',
                    multiPicker: false,
                    show: true,
                    title: 'Insert dictionary item',
                    emptyStateMessage: localizationService.localize('emptyStates_emptyDictionaryTree'),
                    select: function (node) {
                        var code = templateHelper.getInsertDictionarySnippet(node.name);
                        insert(code);
                        vm.dictionaryItemOverlay.show = false;
                        vm.dictionaryItemOverlay = null;
                    },
                    close: function (model) {
                        // close dialog
                        vm.dictionaryItemOverlay.show = false;
                        vm.dictionaryItemOverlay = null;
                        // focus editor
                        vm.editor.focus();
                    }
                };
            }
            function openQueryBuilderOverlay() {
                vm.queryBuilderOverlay = {
                    view: 'querybuilder',
                    show: true,
                    title: 'Query for content',
                    submit: function (model) {
                        var code = templateHelper.getQuerySnippet(model.result.queryExpression);
                        insert(code);
                        vm.queryBuilderOverlay.show = false;
                        vm.queryBuilderOverlay = null;
                    },
                    close: function (model) {
                        // close dialog
                        vm.queryBuilderOverlay.show = false;
                        vm.queryBuilderOverlay = null;
                        // focus editor
                        vm.editor.focus();
                    }
                };
            }
            /* Local functions */
            function init() {
                //we need to load this somewhere, for now its here.
                assetsService.loadCss('lib/ace-razor-mode/theme/razor_chrome.css', $scope);
                if ($routeParams.create) {
                    var snippet = 'Empty';
                    if ($routeParams.snippet) {
                        snippet = $routeParams.snippet;
                    }
                    codefileResource.getScaffold('partialViews', $routeParams.id, snippet).then(function (partialView) {
                        ready(partialView, false);
                    });
                } else {
                    codefileResource.getByPath('partialViews', $routeParams.id).then(function (partialView) {
                        ready(partialView, true);
                    });
                }
            }
            function ready(partialView, syncTree) {
                vm.page.loading = false;
                vm.partialView = partialView;
                //sync state
                editorState.set(vm.partialView);
                if (syncTree) {
                    navigationService.syncTree({
                        tree: 'partialViews',
                        path: vm.partialView.path,
                        forceReload: true
                    }).then(function (syncArgs) {
                        vm.page.menu.currentNode = syncArgs.node;
                    });
                }
                // ace configuration
                vm.aceOption = {
                    mode: 'razor',
                    theme: 'chrome',
                    showPrintMargin: false,
                    advanced: { fontSize: '14px' },
                    onLoad: function (_editor) {
                        vm.editor = _editor;
                        //Update the auto-complete method to use ctrl+alt+space
                        _editor.commands.bindKey('ctrl-alt-space', 'startAutocomplete');
                        //Unassigns the keybinding (That was previously auto-complete)
                        //As conflicts with our own tree search shortcut
                        _editor.commands.bindKey('ctrl-space', null);
                        // Assign new keybinding
                        _editor.commands.addCommands([
                            //Disable (alt+shift+K)
                            //Conflicts with our own show shortcuts dialog - this overrides it
                            {
                                name: 'unSelectOrFindPrevious',
                                bindKey: 'Alt-Shift-K',
                                exec: function () {
                                    //Toggle the show keyboard shortcuts overlay
                                    $scope.$apply(function () {
                                        vm.showKeyboardShortcut = !vm.showKeyboardShortcut;
                                    });
                                },
                                readOnly: true
                            },
                            {
                                name: 'insertUmbracoValue',
                                bindKey: 'Alt-Shift-V',
                                exec: function () {
                                    $scope.$apply(function () {
                                        openPageFieldOverlay();
                                    });
                                },
                                readOnly: true
                            },
                            {
                                name: 'insertDictionary',
                                bindKey: 'Alt-Shift-D',
                                exec: function () {
                                    $scope.$apply(function () {
                                        openDictionaryItemOverlay();
                                    });
                                },
                                readOnly: true
                            },
                            {
                                name: 'insertUmbracoMacro',
                                bindKey: 'Alt-Shift-M',
                                exec: function () {
                                    $scope.$apply(function () {
                                        openMacroOverlay();
                                    });
                                },
                                readOnly: true
                            },
                            {
                                name: 'insertQuery',
                                bindKey: 'Alt-Shift-Q',
                                exec: function () {
                                    $scope.$apply(function () {
                                        openQueryBuilderOverlay();
                                    });
                                },
                                readOnly: true
                            }
                        ]);
                        // initial cursor placement
                        // Keep cursor in name field if we are create a new template
                        // else set the cursor at the bottom of the code editor
                        if (!$routeParams.create) {
                            $timeout(function () {
                                vm.editor.navigateFileEnd();
                                vm.editor.focus();
                                persistCurrentLocation();
                            });
                        }
                        //change on blur, focus
                        vm.editor.on('blur', persistCurrentLocation);
                        vm.editor.on('focus', persistCurrentLocation);
                        vm.editor.on('change', changeAceEditor);
                    }
                };
            }
            function insert(str) {
                vm.editor.focus();
                vm.editor.moveCursorToPosition(vm.currentPosition);
                vm.editor.insert(str);
                // set form state to $dirty
                setFormState('dirty');
            }
            function persistCurrentLocation() {
                vm.currentPosition = vm.editor.getCursorPosition();
            }
            function changeAceEditor() {
                setFormState('dirty');
            }
            function setFormState(state) {
                // get the current form
                var currentForm = angularHelper.getCurrentForm($scope);
                // set state
                if (state === 'dirty') {
                    currentForm.$setDirty();
                } else if (state === 'pristine') {
                    currentForm.$setPristine();
                }
            }
            init();
        }
        angular.module('umbraco').controller('Umbraco.Editors.PartialViews.EditController', PartialViewsEditController);
    }());
    angular.module('umbraco').controller('Umbraco.PrevalueEditors.BooleanController', function ($scope) {
        function updateToggleValue() {
            $scope.toggleValue = false;
            if ($scope.model && $scope.model.value && ($scope.model.value.toString() === '1' || angular.lowercase($scope.model.value) === 'true')) {
                $scope.toggleValue = true;
            }
        }
        if ($scope.model.value === null) {
            $scope.model.value = '0';
        }
        updateToggleValue();
        $scope.toggle = function () {
            if ($scope.model.value === 1 || $scope.model.value === '1') {
                $scope.model.value = '0';
                updateToggleValue();
                return;
            }
            $scope.model.value = '1';
            updateToggleValue();
        };
    });
    angular.module('umbraco').controller('Umbraco.PrevalueEditors.ColorPickerController', function ($scope) {
        //setup the default config
        var config = { useLabel: false };
        //map the user config
        angular.extend(config, $scope.model.config);
        //map back to the model
        $scope.model.config = config;
        $scope.isConfigured = $scope.model.prevalues && _.keys($scope.model.prevalues).length > 0;
        $scope.model.items = [];
        // Make an array from the dictionary
        var items = [];
        if (angular.isArray($scope.model.prevalues)) {
            for (var i in $scope.model.prevalues) {
                var oldValue = $scope.model.prevalues[i];
                if (!isValidHex(oldValue.value || oldValue))
                    continue;
                if (oldValue.hasOwnProperty('value')) {
                    var hexCode = toFullHex(oldValue.value);
                    items.push({
                        value: hexCode.substr(1, hexCode.length),
                        label: oldValue.label,
                        id: i
                    });
                } else {
                    var hexCode = toFullHex(oldValue);
                    items.push({
                        value: hexCode.substr(1, hexCode.length),
                        label: oldValue,
                        id: i
                    });
                }
            }
            // Now make the editor model the array
            $scope.model.items = items;
        }
        function toFullHex(hex) {
            if (hex.length === 4 && hex.charAt(0) === '#') {
                hex = '#' + hex.charAt(1) + hex.charAt(1) + hex.charAt(2) + hex.charAt(2) + hex.charAt(3) + hex.charAt(3);
            }
            return hex.toLowerCase();
        }
        function isValidHex(str) {
            return /(^#[0-9A-F]{6}$)|(^#[0-9A-F]{3}$)/i.test(str);
        }
    });
    function imageFilePickerController($scope) {
        $scope.add = function () {
            $scope.mediaPickerOverlay = {
                view: 'mediapicker',
                disableFolderSelect: true,
                onlyImages: true,
                show: true,
                submit: function (model) {
                    $scope.model.value = model.selectedImages[0].image;
                    $scope.mediaPickerOverlay.show = false;
                    $scope.mediaPickerOverlay = null;
                },
                close: function () {
                    $scope.mediaPickerOverlay.show = false;
                    $scope.mediaPickerOverlay = null;
                }
            };
        };
        $scope.remove = function () {
            $scope.model.value = null;
        };
    }
    angular.module('umbraco').controller('Umbraco.PrevalueEditors.ImageFilePickerController', imageFilePickerController);
    //this controller simply tells the dialogs service to open a mediaPicker window
    //with a specified callback, this callback will receive an object with a selection on it
    function mediaPickerController($scope, dialogService, entityResource, $log, iconHelper) {
        function trim(str, chr) {
            var rgxtrim = !chr ? new RegExp('^\\s+|\\s+$', 'g') : new RegExp('^' + chr + '+|' + chr + '+$', 'g');
            return str.replace(rgxtrim, '');
        }
        $scope.renderModel = [];
        $scope.allowRemove = true;
        $scope.allowEdit = true;
        $scope.sortable = false;
        var dialogOptions = {
            multiPicker: false,
            entityType: 'Media',
            section: 'media',
            treeAlias: 'media',
            idType: 'int'
        };
        //combine the dialogOptions with any values returned from the server
        if ($scope.model.config) {
            angular.extend(dialogOptions, $scope.model.config);
        }
        $scope.openContentPicker = function () {
            $scope.contentPickerOverlay = dialogOptions;
            $scope.contentPickerOverlay.view = 'treePicker';
            $scope.contentPickerOverlay.show = true;
            $scope.contentPickerOverlay.submit = function (model) {
                if ($scope.contentPickerOverlay.multiPicker) {
                    _.each(model.selection, function (item, i) {
                        $scope.add(item);
                    });
                } else {
                    $scope.clear();
                    $scope.add(model.selection[0]);
                }
                $scope.contentPickerOverlay.show = false;
                $scope.contentPickerOverlay = null;
            };
            $scope.contentPickerOverlay.close = function (oldModel) {
                $scope.contentPickerOverlay.show = false;
                $scope.contentPickerOverlay = null;
            };
        };
        $scope.remove = function (index) {
            $scope.renderModel.splice(index, 1);
        };
        $scope.clear = function () {
            $scope.renderModel = [];
        };
        $scope.add = function (item) {
            var itemId = dialogOptions.idType === 'udi' ? item.udi : item.id;
            var currIds = _.map($scope.renderModel, function (i) {
                return dialogOptions.idType === 'udi' ? i.udi : i.id;
            });
            if (currIds.indexOf(itemId) < 0) {
                item.icon = iconHelper.convertFromLegacyIcon(item.icon);
                $scope.renderModel.push({
                    name: item.name,
                    id: item.id,
                    icon: item.icon,
                    udi: item.udi
                });
                // store the index of the new item in the renderModel collection so we can find it again
                var itemRenderIndex = $scope.renderModel.length - 1;
                // get and update the path for the picked node
                entityResource.getUrl(item.id, dialogOptions.entityType).then(function (data) {
                    $scope.renderModel[itemRenderIndex].path = data;
                });
            }
        };
        var unsubscribe = $scope.$on('formSubmitting', function (ev, args) {
            var currIds = _.map($scope.renderModel, function (i) {
                return dialogOptions.idType === 'udi' ? i.udi : i.id;
            });
            $scope.model.value = trim(currIds.join(), ',');
        });
        //when the scope is destroyed we need to unsubscribe
        $scope.$on('$destroy', function () {
            unsubscribe();
        });
        //load media data
        var modelIds = $scope.model.value ? $scope.model.value.split(',') : [];
        if (modelIds.length > 0) {
            entityResource.getByIds(modelIds, dialogOptions.entityType).then(function (data) {
                _.each(data, function (item, i) {
                    item.icon = iconHelper.convertFromLegacyIcon(item.icon);
                    $scope.renderModel.push({
                        name: item.name,
                        id: item.id,
                        icon: item.icon,
                        udi: item.udi
                    });
                    // store the index of the new item in the renderModel collection so we can find it again
                    var itemRenderIndex = $scope.renderModel.length - 1;
                    // get and update the path for the picked node
                    entityResource.getUrl(item.id, dialogOptions.entityType).then(function (data) {
                        $scope.renderModel[itemRenderIndex].path = data;
                    });
                });
            });
        }
    }
    angular.module('umbraco').controller('Umbraco.PrevalueEditors.MediaPickerController', mediaPickerController);
    angular.module('umbraco').controller('Umbraco.PrevalueEditors.MultiValuesController', function ($scope, $timeout) {
        //NOTE: We need to make each item an object, not just a string because you cannot 2-way bind to a primitive.
        $scope.newItem = '';
        $scope.hasError = false;
        $scope.focusOnNew = false;
        if (!angular.isArray($scope.model.value)) {
            //make an array from the dictionary
            var items = [];
            for (var i in $scope.model.value) {
                items.push({
                    value: $scope.model.value[i].value,
                    sortOrder: $scope.model.value[i].sortOrder,
                    id: i
                });
            }
            //ensure the items are sorted by the provided sort order
            items.sort(function (a, b) {
                return a.sortOrder > b.sortOrder ? 1 : b.sortOrder > a.sortOrder ? -1 : 0;
            });
            //now make the editor model the array
            $scope.model.value = items;
        }
        $scope.remove = function (item, evt) {
            evt.preventDefault();
            $scope.model.value = _.reject($scope.model.value, function (x) {
                return x.value === item.value;
            });
        };
        $scope.add = function (evt) {
            evt.preventDefault();
            if ($scope.newItem) {
                if (!_.contains($scope.model.value, $scope.newItem)) {
                    $scope.model.value.push({ value: $scope.newItem });
                    $scope.newItem = '';
                    $scope.hasError = false;
                    $scope.focusOnNew = true;
                    return;
                }
            }
            //there was an error, do the highlight (will be set back by the directive)
            $scope.hasError = true;
        };
        $scope.sortableOptions = {
            axis: 'y',
            containment: 'parent',
            cursor: 'move',
            items: '> div.control-group',
            tolerance: 'pointer',
            update: function (e, ui) {
                // Get the new and old index for the moved element (using the text as the identifier, so 
                // we'd have a problem if two prevalues were the same, but that would be unlikely)
                var newIndex = ui.item.index();
                var movedPrevalueText = $('input[type="text"]', ui.item).val();
                var originalIndex = getElementIndexByPrevalueText(movedPrevalueText);
                // Move the element in the model
                if (originalIndex > -1) {
                    var movedElement = $scope.model.value[originalIndex];
                    $scope.model.value.splice(originalIndex, 1);
                    $scope.model.value.splice(newIndex, 0, movedElement);
                }
            }
        };
        $scope.createNew = function (event) {
            if (event.keyCode == 13) {
                $scope.add(event);
            }
        };
        function getElementIndexByPrevalueText(value) {
            for (var i = 0; i < $scope.model.value.length; i++) {
                if ($scope.model.value[i].value === value) {
                    return i;
                }
            }
            return -1;
        }
    });
    //this controller simply tells the dialogs service to open a mediaPicker window
    //with a specified callback, this callback will receive an object with a selection on it
    angular.module('umbraco').controller('Umbraco.PrevalueEditors.TreePickerController', function ($scope, dialogService, entityResource, $log, iconHelper) {
        $scope.renderModel = [];
        $scope.ids = [];
        $scope.allowRemove = true;
        $scope.allowEdit = true;
        $scope.sortable = false;
        var config = {
            multiPicker: false,
            entityType: 'Document',
            type: 'content',
            treeAlias: 'content',
            idType: 'int'
        };
        //combine the config with any values returned from the server
        if ($scope.model.config) {
            angular.extend(config, $scope.model.config);
        }
        if ($scope.model.value) {
            $scope.ids = $scope.model.value.split(',');
            entityResource.getByIds($scope.ids, config.entityType).then(function (data) {
                _.each(data, function (item, i) {
                    item.icon = iconHelper.convertFromLegacyIcon(item.icon);
                    $scope.renderModel.push({
                        name: item.name,
                        id: item.id,
                        icon: item.icon,
                        udi: item.udi
                    });
                    // store the index of the new item in the renderModel collection so we can find it again
                    var itemRenderIndex = $scope.renderModel.length - 1;
                    // get and update the path for the picked node
                    entityResource.getUrl(item.id, config.entityType).then(function (data) {
                        $scope.renderModel[itemRenderIndex].path = data;
                    });
                });
            });
        }
        $scope.openContentPicker = function () {
            $scope.treePickerOverlay = config;
            $scope.treePickerOverlay.section = config.type;
            $scope.treePickerOverlay.view = 'treePicker';
            $scope.treePickerOverlay.show = true;
            $scope.treePickerOverlay.submit = function (model) {
                if (config.multiPicker) {
                    populate(model.selection);
                } else {
                    populate(model.selection[0]);
                }
                $scope.treePickerOverlay.show = false;
                $scope.treePickerOverlay = null;
            };
            $scope.treePickerOverlay.close = function (oldModel) {
                $scope.treePickerOverlay.show = false;
                $scope.treePickerOverlay = null;
            };
        };
        $scope.remove = function (index) {
            $scope.renderModel.splice(index, 1);
            $scope.ids.splice(index, 1);
            $scope.model.value = trim($scope.ids.join(), ',');
        };
        $scope.clear = function () {
            $scope.model.value = '';
            $scope.renderModel = [];
            $scope.ids = [];
        };
        $scope.add = function (item) {
            var itemId = config.idType === 'udi' ? item.udi : item.id;
            if ($scope.ids.indexOf(itemId) < 0) {
                item.icon = iconHelper.convertFromLegacyIcon(item.icon);
                $scope.ids.push(itemId);
                $scope.renderModel.push({
                    name: item.name,
                    id: item.id,
                    icon: item.icon,
                    udi: item.udi
                });
                $scope.model.value = trim($scope.ids.join(), ',');
                // store the index of the new item in the renderModel collection so we can find it again
                var itemRenderIndex = $scope.renderModel.length - 1;
                // get and update the path for the picked node
                entityResource.getUrl(item.id, config.entityType).then(function (data) {
                    $scope.renderModel[itemRenderIndex].path = data;
                });
            }
        };
        var unsubscribe = $scope.$on('formSubmitting', function (ev, args) {
            $scope.model.value = trim($scope.ids.join(), ',');
        });
        //when the scope is destroyed we need to unsubscribe
        $scope.$on('$destroy', function () {
            unsubscribe();
        });
        function trim(str, chr) {
            var rgxtrim = !chr ? new RegExp('^\\s+|\\s+$', 'g') : new RegExp('^' + chr + '+|' + chr + '+$', 'g');
            return str.replace(rgxtrim, '');
        }
        function populate(data) {
            if (angular.isArray(data)) {
                _.each(data, function (item, i) {
                    $scope.add(item);
                });
            } else {
                $scope.clear();
                $scope.add(data);
            }
        }
    });
    //this controller simply tells the dialogs service to open a mediaPicker window
    //with a specified callback, this callback will receive an object with a selection on it
    angular.module('umbraco').controller('Umbraco.PrevalueEditors.TreeSourceController', function ($scope, dialogService, entityResource, $log, iconHelper) {
        if (!$scope.model) {
            $scope.model = {};
        }
        if (!$scope.model.value) {
            $scope.model.value = { type: 'content' };
        }
        if (!$scope.model.config) {
            $scope.model.config = { idType: 'int' };
        }
        if ($scope.model.value.id && $scope.model.value.type !== 'member') {
            var ent = 'Document';
            if ($scope.model.value.type === 'media') {
                ent = 'Media';
            }
            entityResource.getById($scope.model.value.id, ent).then(function (item) {
                item.icon = iconHelper.convertFromLegacyIcon(item.icon);
                $scope.node = item;
            });
        }
        $scope.openContentPicker = function () {
            $scope.treePickerOverlay = {
                view: 'treepicker',
                idType: $scope.model.config.idType,
                section: $scope.model.value.type,
                treeAlias: $scope.model.value.type,
                multiPicker: false,
                show: true,
                submit: function (model) {
                    var item = model.selection[0];
                    populate(item);
                    $scope.treePickerOverlay.show = false;
                    $scope.treePickerOverlay = null;
                }
            };
        };
        $scope.clear = function () {
            $scope.model.value.id = undefined;
            $scope.node = undefined;
            $scope.model.value.query = undefined;
        };
        //we always need to ensure we dont submit anything broken
        var unsubscribe = $scope.$on('formSubmitting', function (ev, args) {
            if ($scope.model.value.type === 'member') {
                $scope.model.value.id = -1;
                $scope.model.value.query = '';
            }
        });
        //when the scope is destroyed we need to unsubscribe
        $scope.$on('$destroy', function () {
            unsubscribe();
        });
        function populate(item) {
            $scope.clear();
            item.icon = iconHelper.convertFromLegacyIcon(item.icon);
            $scope.node = item;
            $scope.model.value.id = $scope.model.config.idType === 'udi' ? item.udi : item.id;
        }
    });
    function booleanEditorController($scope, angularHelper) {
        function setupViewModel() {
            $scope.renderModel = { value: false };
            if ($scope.model.config && $scope.model.config.default && $scope.model.config.default.toString() === '1' && $scope.model && !$scope.model.value) {
                $scope.renderModel.value = true;
            }
            if ($scope.model && $scope.model.value && ($scope.model.value.toString() === '1' || angular.lowercase($scope.model.value) === 'true')) {
                $scope.renderModel.value = true;
            }
        }
        setupViewModel();
        if ($scope.model && !$scope.model.value) {
            $scope.model.value = $scope.renderModel.value === true ? '1' : '0';
        }
        //here we declare a special method which will be called whenever the value has changed from the server
        //this is instead of doing a watch on the model.value = faster
        $scope.model.onValueChanged = function (newVal, oldVal) {
            //update the display val again if it has changed from the server
            setupViewModel();
        };
        // Update the value when the toggle is clicked
        $scope.toggle = function () {
            angularHelper.getCurrentForm($scope).$setDirty();
            if ($scope.renderModel.value) {
                $scope.model.value = '0';
                setupViewModel();
                return;
            }
            $scope.model.value = '1';
            setupViewModel();
        };
    }
    angular.module('umbraco').controller('Umbraco.PropertyEditors.BooleanController', booleanEditorController);
    angular.module('umbraco').controller('Umbraco.PropertyEditors.ChangePasswordController', function ($scope, $routeParams) {
        $scope.isNew = $routeParams.create;
        function resetModel() {
            //the model config will contain an object, if it does not we'll create defaults
            //NOTE: We will not support doing the password regex on the client side because the regex on the server side
            //based on the membership provider cannot always be ported to js from .net directly.        
            /*
      {
          hasPassword: true/false,
          requiresQuestionAnswer: true/false,
          enableReset: true/false,
          enablePasswordRetrieval: true/false,
          minPasswordLength: 10
      }
      */
            //set defaults if they are not available
            if (!$scope.model.config || $scope.model.config.disableToggle === undefined) {
                $scope.model.config.disableToggle = false;
            }
            if (!$scope.model.config || $scope.model.config.hasPassword === undefined) {
                $scope.model.config.hasPassword = false;
            }
            if (!$scope.model.config || $scope.model.config.enablePasswordRetrieval === undefined) {
                $scope.model.config.enablePasswordRetrieval = true;
            }
            if (!$scope.model.config || $scope.model.config.requiresQuestionAnswer === undefined) {
                $scope.model.config.requiresQuestionAnswer = false;
            }
            if (!$scope.model.config || $scope.model.config.enableReset === undefined) {
                $scope.model.config.enableReset = true;
            }
            if (!$scope.model.config || $scope.model.config.minPasswordLength === undefined) {
                $scope.model.config.minPasswordLength = 0;
            }
            //set the model defaults
            if (!angular.isObject($scope.model.value)) {
                //if it's not an object then just create a new one
                $scope.model.value = {
                    newPassword: null,
                    oldPassword: null,
                    reset: null,
                    answer: null
                };
            } else {
                //just reset the values
                if (!$scope.isNew) {
                    //if it is new, then leave the generated pass displayed
                    $scope.model.value.newPassword = null;
                    $scope.model.value.oldPassword = null;
                }
                $scope.model.value.reset = null;
                $scope.model.value.answer = null;
            }
        }
        resetModel();
    });
    angular.module('umbraco').controller('Umbraco.PropertyEditors.CheckboxListController', function ($scope) {
        if (angular.isObject($scope.model.config.items)) {
            //now we need to format the items in the dictionary because we always want to have an array
            var newItems = [];
            var vals = _.values($scope.model.config.items);
            var keys = _.keys($scope.model.config.items);
            for (var i = 0; i < vals.length; i++) {
                newItems.push({
                    id: keys[i],
                    sortOrder: vals[i].sortOrder,
                    value: vals[i].value
                });
            }
            //ensure the items are sorted by the provided sort order
            newItems.sort(function (a, b) {
                return a.sortOrder > b.sortOrder ? 1 : b.sortOrder > a.sortOrder ? -1 : 0;
            });
            //re-assign
            $scope.model.config.items = newItems;
        }
        function setupViewModel() {
            $scope.selectedItems = [];
            //now we need to check if the value is null/undefined, if it is we need to set it to "" so that any value that is set
            // to "" gets selected by default
            if ($scope.model.value === null || $scope.model.value === undefined) {
                $scope.model.value = [];
            }
            for (var i = 0; i < $scope.model.config.items.length; i++) {
                var isChecked = _.contains($scope.model.value, $scope.model.config.items[i].id);
                $scope.selectedItems.push({
                    checked: isChecked,
                    key: $scope.model.config.items[i].id,
                    val: $scope.model.config.items[i].value
                });
            }
        }
        setupViewModel();
        //update the model when the items checked changes
        $scope.$watch('selectedItems', function (newVal, oldVal) {
            $scope.model.value = [];
            for (var x = 0; x < $scope.selectedItems.length; x++) {
                if ($scope.selectedItems[x].checked) {
                    $scope.model.value.push($scope.selectedItems[x].key);
                }
            }
        }, true);
        //here we declare a special method which will be called whenever the value has changed from the server
        //this is instead of doing a watch on the model.value = faster
        $scope.model.onValueChanged = function (newVal, oldVal) {
            //update the display val again if it has changed from the server
            setupViewModel();
        };
    });
    function ColorPickerController($scope, angularHelper) {
        //setup the default config
        var config = {
            items: [],
            multiple: false
        };
        //map the user config
        angular.extend(config, $scope.model.config);
        //map back to the model
        $scope.model.config = config;
        $scope.isConfigured = $scope.model.config && $scope.model.config.items && _.keys($scope.model.config.items).length > 0;
        $scope.model.activeColor = {
            value: '',
            label: ''
        };
        if ($scope.isConfigured) {
            for (var key in $scope.model.config.items) {
                if (!$scope.model.config.items[key].hasOwnProperty('value'))
                    $scope.model.config.items[key] = {
                        value: $scope.model.config.items[key],
                        label: $scope.model.config.items[key]
                    };
            }
            $scope.model.useLabel = isTrue($scope.model.config.useLabel);
            initActiveColor();
        }
        if (!angular.isArray($scope.model.config.items)) {
            //make an array from the dictionary
            var items = [];
            for (var i in $scope.model.config.items) {
                var oldValue = $scope.model.config.items[i];
                if (oldValue.hasOwnProperty('value')) {
                    items.push({
                        value: oldValue.value,
                        label: oldValue.label,
                        sortOrder: oldValue.sortOrder,
                        id: i
                    });
                } else {
                    items.push({
                        value: oldValue,
                        label: oldValue,
                        sortOrder: sortOrder,
                        id: i
                    });
                }
            }
            //ensure the items are sorted by the provided sort order
            items.sort(function (a, b) {
                return a.sortOrder > b.sortOrder ? 1 : b.sortOrder > a.sortOrder ? -1 : 0;
            });
            //now make the editor model the array
            $scope.model.config.items = items;
        }
        // Method required by the valPropertyValidator directive (returns true if the property editor has at least one color selected)
        $scope.validateMandatory = function () {
            var isValid = !$scope.model.validation.mandatory || $scope.model.value != null && $scope.model.value != '' && (!$scope.model.value.hasOwnProperty('value') || $scope.model.value.value !== '');
            return {
                isValid: isValid,
                errorMsg: 'Value cannot be empty',
                errorKey: 'required'
            };
        };
        $scope.isConfigured = $scope.model.config && $scope.model.config.items && _.keys($scope.model.config.items).length > 0;
        $scope.onSelect = function (color) {
            // did the value change?
            if ($scope.model.value != null && $scope.model.value.value === color) {
                // User clicked the currently selected color
                // to remove the selection, they don't want
                // to select any color after all.
                // Unselect the color and mark as dirty
                $scope.model.activeColor = null;
                $scope.model.value = null;
                angularHelper.getCurrentForm($scope).$setDirty();
                return;
            }
            // yes, update the model (label + value) according to the new color
            var selectedItem = _.find($scope.model.config.items, function (item) {
                return item.value === color;
            });
            if (!selectedItem) {
                return;
            }
            $scope.model.value = {
                label: selectedItem.label,
                value: selectedItem.value
            };
            // make sure to set dirty
            angularHelper.getCurrentForm($scope).$setDirty();
        };
        // Finds the color best matching the model's color,
        // and sets the model color to that one. This is useful when
        // either the value or label was changed on the data type.
        function initActiveColor() {
            // no value - initialize default value
            if (!$scope.model.value)
                return;
            // Backwards compatibility, the color used to be stored as a hex value only
            if (typeof $scope.model.value === 'string') {
                $scope.model.value = {
                    value: $scope.model.value,
                    label: $scope.model.value
                };
            }
            var modelColor = $scope.model.value.value;
            var modelLabel = $scope.model.value.label;
            // Check for a full match or partial match.
            var foundItem = null;
            // Look for a fully matching color.
            for (var key in $scope.model.config.items) {
                var item = $scope.model.config.items[key];
                if (item.value == modelColor && item.label == modelLabel) {
                    foundItem = item;
                    break;
                }
            }
            // Look for a color with a matching value.
            if (!foundItem) {
                for (var key in $scope.model.config.items) {
                    var item = $scope.model.config.items[key];
                    if (item.value == modelColor) {
                        foundItem = item;
                        break;
                    }
                }
            }
            // Look for a color with a matching label.
            if (!foundItem) {
                for (var key in $scope.model.config.items) {
                    var item = $scope.model.config.items[key];
                    if (item.label == modelLabel) {
                        foundItem = item;
                        break;
                    }
                }
            }
            // If a match was found, set it as the active color.
            if (foundItem) {
                $scope.model.activeColor.value = foundItem.value;
                $scope.model.activeColor.label = foundItem.label;
            }
        }
        // figures out if a value is trueish enough
        function isTrue(bool) {
            return !!bool && bool !== '0' && angular.lowercase(bool) !== 'false';
        }
    }
    angular.module('umbraco').controller('Umbraco.PropertyEditors.ColorPickerController', ColorPickerController);
    angular.module('umbraco').controller('Umbraco.PrevalueEditors.MultiColorPickerController', function ($scope, $timeout, assetsService, angularHelper, $element, localizationService, eventsService) {
        //NOTE: We need to make each color an object, not just a string because you cannot 2-way bind to a primitive.
        var defaultColor = '000000';
        var defaultLabel = null;
        $scope.newColor = defaultColor;
        $scope.newLabel = defaultLabel;
        $scope.hasError = false;
        $scope.focusOnNew = false;
        $scope.labels = {};
        var labelKeys = [
            'general_cancel',
            'general_choose'
        ];
        $scope.labelEnabled = false;
        eventsService.on('toggleValue', function (e, args) {
            $scope.labelEnabled = args.value;
        });
        localizationService.localizeMany(labelKeys).then(function (values) {
            $scope.labels.cancel = values[0];
            $scope.labels.choose = values[1];
        });
        assetsService.load([//"lib/spectrum/tinycolor.js",
            'lib/spectrum/spectrum.js'], $scope).then(function () {
            var elem = $element.find('input[name=\'newColor\']');
            elem.spectrum({
                color: null,
                showInitial: false,
                chooseText: $scope.labels.choose,
                cancelText: $scope.labels.cancel,
                preferredFormat: 'hex',
                showInput: true,
                clickoutFiresChange: true,
                hide: function (color) {
                    //show the add butotn
                    $element.find('.btn.add').show();
                },
                change: function (color) {
                    angularHelper.safeApply($scope, function () {
                        $scope.newColor = color.toHexString().trimStart('#');    // #ff0000
                    });
                },
                show: function () {
                    //hide the add butotn
                    $element.find('.btn.add').hide();
                }
            });
        });
        if (!angular.isArray($scope.model.value)) {
            //make an array from the dictionary
            var items = [];
            for (var i in $scope.model.value) {
                var oldValue = $scope.model.value[i];
                if (oldValue.hasOwnProperty('value')) {
                    items.push({
                        value: oldValue.value,
                        label: oldValue.label,
                        sortOrder: oldValue.sortOrder,
                        id: i
                    });
                } else {
                    items.push({
                        value: oldValue,
                        label: oldValue,
                        sortOrder: sortOrder,
                        id: i
                    });
                }
            }
            //ensure the items are sorted by the provided sort order
            items.sort(function (a, b) {
                return a.sortOrder > b.sortOrder ? 1 : b.sortOrder > a.sortOrder ? -1 : 0;
            });
            //now make the editor model the array
            $scope.model.value = items;
        }
        // ensure labels
        for (var i = 0; i < $scope.model.value.length; i++) {
            var item = $scope.model.value[i];
            item.label = item.hasOwnProperty('label') ? item.label : item.value;
        }
        function validLabel(label) {
            return label !== null && typeof label !== 'undefined' && label !== '' && label.length && label.length > 0;
        }
        $scope.remove = function (item, evt) {
            evt.preventDefault();
            $scope.model.value = _.reject($scope.model.value, function (x) {
                return x.value === item.value && x.label === item.label;
            });
        };
        $scope.add = function (evt) {
            evt.preventDefault();
            if ($scope.newColor) {
                var newLabel = validLabel($scope.newLabel) ? $scope.newLabel : $scope.newColor;
                var exists = _.find($scope.model.value, function (item) {
                    return item.value.toUpperCase() === $scope.newColor.toUpperCase() || item.label.toUpperCase() === newLabel.toUpperCase();
                });
                if (!exists) {
                    $scope.model.value.push({
                        value: $scope.newColor,
                        label: newLabel
                    });
                    $scope.newLabel = '';
                    $scope.hasError = false;
                    $scope.focusOnNew = true;
                    return;
                }
                //there was an error, do the highlight (will be set back by the directive)
                $scope.hasError = true;
            }
        };
        $scope.sortableOptions = {
            axis: 'y',
            containment: 'parent',
            cursor: 'move',
            //handle: ".handle, .thumbnail",
            items: '> div.control-group',
            tolerance: 'pointer',
            update: function (e, ui) {
                // Get the new and old index for the moved element (using the text as the identifier, so 
                // we'd have a problem if two prevalues were the same, but that would be unlikely)
                var newIndex = ui.item.index();
                var movedPrevalueText = $('pre', ui.item).text();
                var originalIndex = getElementIndexByPrevalueText(movedPrevalueText);
                //// Move the element in the model
                if (originalIndex > -1) {
                    var movedElement = $scope.model.value[originalIndex];
                    $scope.model.value.splice(originalIndex, 1);
                    $scope.model.value.splice(newIndex, 0, movedElement);
                }
            }
        };
        function getElementIndexByPrevalueText(value) {
            for (var i = 0; i < $scope.model.value.length; i++) {
                if ($scope.model.value[i].value === value) {
                    return i;
                }
            }
            return -1;
        }
        //load the separate css for the editor to avoid it blocking our js loading
        assetsService.loadCss('lib/spectrum/spectrum.css', $scope);
    });
    //this controller simply tells the dialogs service to open a mediaPicker window
    //with a specified callback, this callback will receive an object with a selection on it
    function contentPickerController($scope, entityResource, editorState, iconHelper, $routeParams, angularHelper, navigationService, $location, miniEditorHelper, localizationService) {
        var unsubscribe;
        function subscribe() {
            unsubscribe = $scope.$on('formSubmitting', function (ev, args) {
                var currIds = _.map($scope.renderModel, function (i) {
                    return $scope.model.config.idType === 'udi' ? i.udi : i.id;
                });
                $scope.model.value = trim(currIds.join(), ',');
            });
        }
        function trim(str, chr) {
            var rgxtrim = !chr ? new RegExp('^\\s+|\\s+$', 'g') : new RegExp('^' + chr + '+|' + chr + '+$', 'g');
            return str.replace(rgxtrim, '');
        }
        function startWatch() {
            //We need to watch our renderModel so that we can update the underlying $scope.model.value properly, this is required
            // because the ui-sortable doesn't dispatch an event after the digest of the sort operation. Any of the events for UI sortable
            // occur after the DOM has updated but BEFORE the digest has occured so the model has NOT changed yet - it even states so in the docs.
            // In their source code there is no event so we need to just subscribe to our model changes here.
            //This also makes it easier to manage models, we update one and the rest will just work.
            $scope.$watch(function () {
                //return the joined Ids as a string to watch
                return _.map($scope.renderModel, function (i) {
                    return $scope.model.config.idType === 'udi' ? i.udi : i.id;
                }).join();
            }, function (newVal) {
                var currIds = _.map($scope.renderModel, function (i) {
                    return $scope.model.config.idType === 'udi' ? i.udi : i.id;
                });
                $scope.model.value = trim(currIds.join(), ',');
                //Validate!
                if ($scope.model.config && $scope.model.config.minNumber && parseInt($scope.model.config.minNumber) > $scope.renderModel.length) {
                    $scope.contentPickerForm.minCount.$setValidity('minCount', false);
                } else {
                    $scope.contentPickerForm.minCount.$setValidity('minCount', true);
                }
                if ($scope.model.config && $scope.model.config.maxNumber && parseInt($scope.model.config.maxNumber) < $scope.renderModel.length) {
                    $scope.contentPickerForm.maxCount.$setValidity('maxCount', false);
                } else {
                    $scope.contentPickerForm.maxCount.$setValidity('maxCount', true);
                }
                setSortingState($scope.renderModel);
            });
        }
        $scope.renderModel = [];
        $scope.dialogEditor = editorState && editorState.current && editorState.current.isDialogEditor === true;
        //the default pre-values
        var defaultConfig = {
            multiPicker: false,
            showOpenButton: false,
            showEditButton: false,
            showPathOnHover: false,
            dataTypeId: null,
            maxNumber: 1,
            minNumber: 0,
            startNode: {
                query: '',
                type: 'content',
                id: $scope.model.config.startNodeId ? $scope.model.config.startNodeId : -1    // get start node for simple Content Picker
            }
        };
        // sortable options
        $scope.sortableOptions = {
            axis: 'y',
            containment: 'parent',
            distance: 10,
            opacity: 0.7,
            tolerance: 'pointer',
            scroll: true,
            zIndex: 6000,
            update: function (e, ui) {
                angularHelper.getCurrentForm($scope).$setDirty();
            }
        };
        if ($scope.model.config) {
            //merge the server config on top of the default config, then set the server config to use the result
            $scope.model.config = angular.extend(defaultConfig, $scope.model.config);
        }
        //Umbraco persists boolean for prevalues as "0" or "1" so we need to convert that!
        $scope.model.config.multiPicker = $scope.model.config.multiPicker === '1' ? true : false;
        $scope.model.config.showOpenButton = $scope.model.config.showOpenButton === '1' ? true : false;
        $scope.model.config.showEditButton = $scope.model.config.showEditButton === '1' ? true : false;
        $scope.model.config.showPathOnHover = $scope.model.config.showPathOnHover === '1' ? true : false;
        var entityType = $scope.model.config.startNode.type === 'member' ? 'Member' : $scope.model.config.startNode.type === 'media' ? 'Media' : 'Document';
        $scope.allowOpenButton = entityType === 'Document';
        $scope.allowEditButton = entityType === 'Document';
        $scope.allowRemoveButton = true;
        //the dialog options for the picker
        var dialogOptions = {
            multiPicker: $scope.model.config.multiPicker,
            entityType: entityType,
            filterCssClass: 'not-allowed not-published',
            startNodeId: null,
            currentNode: editorState ? editorState.current : null,
            callback: function (data) {
                if (angular.isArray(data)) {
                    _.each(data, function (item, i) {
                        $scope.add(item);
                    });
                } else {
                    $scope.clear();
                    $scope.add(data);
                }
                angularHelper.getCurrentForm($scope).$setDirty();
            },
            treeAlias: $scope.model.config.startNode.type,
            section: $scope.model.config.startNode.type,
            idType: 'int'
        };
        //since most of the pre-value config's are used in the dialog options (i.e. maxNumber, minNumber, etc...) we'll merge the
        // pre-value config on to the dialog options
        angular.extend(dialogOptions, $scope.model.config);
        //We need to manually handle the filter for members here since the tree displayed is different and only contains
        // searchable list views
        if (entityType === 'Member') {
            //first change the not allowed filter css class
            dialogOptions.filterCssClass = 'not-allowed';
            var currFilter = dialogOptions.filter;
            //now change the filter to be a method
            dialogOptions.filter = function (i) {
                //filter out the list view nodes
                if (i.metaData.isContainer) {
                    return true;
                }
                if (!currFilter) {
                    return false;
                }
                //now we need to filter based on what is stored in the pre-vals, this logic duplicates what is in the treepicker.controller,
                // but not much we can do about that since members require special filtering.
                var filterItem = currFilter.toLowerCase().split(',');
                var found = filterItem.indexOf(i.metaData.contentType.toLowerCase()) >= 0;
                if (!currFilter.startsWith('!') && !found || currFilter.startsWith('!') && found) {
                    return true;
                }
                return false;
            };
        }
        if ($routeParams.section === 'settings' && $routeParams.tree === 'documentTypes') {
            //if the content-picker is being rendered inside the document-type editor, we don't need to process the startnode query
            dialogOptions.startNodeId = -1;
        } else if ($scope.model.config.startNode.query) {
            //if we have a query for the startnode, we will use that.
            var rootId = $routeParams.id;
            entityResource.getByQuery($scope.model.config.startNode.query, rootId, 'Document').then(function (ent) {
                dialogOptions.startNodeId = $scope.model.config.idType === 'udi' ? ent.udi : ent.id;
            });
        } else {
            dialogOptions.startNodeId = $scope.model.config.startNode.id;
        }
        //dialog
        $scope.openContentPicker = function () {
            $scope.contentPickerOverlay = dialogOptions;
            $scope.contentPickerOverlay.view = 'treepicker';
            $scope.contentPickerOverlay.show = true;
            $scope.contentPickerOverlay.dataTypeId = $scope.model && $scope.model.dataTypeId ? $scope.model.dataTypeId : null;
            $scope.contentPickerOverlay.submit = function (model) {
                if (angular.isArray(model.selection)) {
                    _.each(model.selection, function (item, i) {
                        $scope.add(item);
                    });
                    angularHelper.getCurrentForm($scope).$setDirty();
                }
                $scope.contentPickerOverlay.show = false;
                $scope.contentPickerOverlay = null;
            };
            $scope.contentPickerOverlay.close = function (oldModel) {
                $scope.contentPickerOverlay.show = false;
                $scope.contentPickerOverlay = null;
            };
        };
        $scope.remove = function (index) {
            $scope.renderModel.splice(index, 1);
            angularHelper.getCurrentForm($scope).$setDirty();
        };
        $scope.showNode = function (index) {
            var item = $scope.renderModel[index];
            var id = item.id;
            var section = $scope.model.config.startNode.type.toLowerCase();
            entityResource.getPath(id, entityType).then(function (path) {
                navigationService.changeSection(section);
                navigationService.showTree(section, {
                    tree: section,
                    path: path,
                    forceReload: false,
                    activate: true
                });
                var routePath = section + '/' + section + '/edit/' + id.toString();
                $location.path(routePath).search('');
            });
        };
        $scope.add = function (item) {
            var currIds = _.map($scope.renderModel, function (i) {
                return $scope.model.config.idType === 'udi' ? i.udi : i.id;
            });
            var itemId = $scope.model.config.idType === 'udi' ? item.udi : item.id;
            if (currIds.indexOf(itemId) < 0) {
                setEntityUrl(item);
            }
        };
        $scope.clear = function () {
            $scope.renderModel = [];
        };
        $scope.openMiniEditor = function (node) {
            miniEditorHelper.launchMiniEditor(node).then(function (updatedNode) {
                // update the node
                node.name = updatedNode.name;
                node.published = updatedNode.hasPublishedVersion;
                if (entityType !== 'Member') {
                    entityResource.getUrl(updatedNode.id, entityType).then(function (data) {
                        node.url = data;
                    });
                }
            });
        };
        //when the scope is destroyed we need to unsubscribe
        $scope.$on('$destroy', function () {
            if (unsubscribe) {
                unsubscribe();
            }
        });
        var modelIds = $scope.model.value ? $scope.model.value.split(',') : [];
        //load current data if anything selected
        if (modelIds.length > 0) {
            entityResource.getByIds(modelIds, entityType).then(function (data) {
                _.each(modelIds, function (id, i) {
                    var entity = _.find(data, function (d) {
                        return $scope.model.config.idType === 'udi' ? d.udi == id : d.id == id;
                    });
                    if (entity) {
                        setEntityUrl(entity);
                    }
                });
                //everything is loaded, start the watch on the model
                startWatch();
                subscribe();
            });
        } else {
            //everything is loaded, start the watch on the model
            startWatch();
            subscribe();
        }
        function setEntityUrl(entity) {
            // get url for content and media items
            if (entityType !== 'Member') {
                entityResource.getUrl(entity.id, entityType).then(function (data) {
                    // update url
                    angular.forEach($scope.renderModel, function (item) {
                        if (item.id === entity.id) {
                            if (entity.trashed) {
                                item.url = localizationService.dictionary.general_recycleBin;
                            } else {
                                item.url = data;
                            }
                        }
                    });
                });
            }
            // add the selected item to the renderModel
            // if it needs to show a url the item will get
            // updated when the url comes back from server
            addSelectedItem(entity);
        }
        function addSelectedItem(item) {
            // set icon
            if (item.icon) {
                item.icon = iconHelper.convertFromLegacyIcon(item.icon);
            }
            // set default icon
            if (!item.icon) {
                switch (entityType) {
                case 'Document':
                    item.icon = 'icon-document';
                    break;
                case 'Media':
                    item.icon = 'icon-picture';
                    break;
                case 'Member':
                    item.icon = 'icon-user';
                    break;
                }
            }
            $scope.renderModel.push({
                'name': item.name,
                'id': item.id,
                'udi': item.udi,
                'icon': item.icon,
                'path': item.path,
                'url': item.url,
                'trashed': item.trashed,
                'published': item.metaData && item.metaData.IsPublished === false && entityType === 'Document' ? false : true    // only content supports published/unpublished content so we set everything else to published so the UI looks correct
            });
        }
        function setSortingState(items) {
            // disable sorting if the list only consist of one item
            if (items.length > 1) {
                $scope.sortableOptions.disabled = false;
            } else {
                $scope.sortableOptions.disabled = true;
            }
        }
    }
    angular.module('umbraco').controller('Umbraco.PropertyEditors.ContentPickerController', contentPickerController);
    function dateTimePickerController($scope, notificationsService, assetsService, angularHelper, userService, $element, dateHelper) {
        //setup the default config
        var config = {
            pickDate: true,
            pickTime: true,
            useSeconds: true,
            format: 'YYYY-MM-DD HH:mm:ss',
            icons: {
                time: 'icon-time',
                date: 'icon-calendar',
                up: 'icon-chevron-up',
                down: 'icon-chevron-down'
            }
        };
        //map the user config
        $scope.model.config = angular.extend(config, $scope.model.config);
        //ensure the format doesn't get overwritten with an empty string
        if ($scope.model.config.format === '' || $scope.model.config.format === undefined || $scope.model.config.format === null) {
            $scope.model.config.format = $scope.model.config.pickTime ? 'YYYY-MM-DD HH:mm:ss' : 'YYYY-MM-DD';
        }
        $scope.hasDatetimePickerValue = $scope.model.value ? true : false;
        $scope.datetimePickerValue = null;
        //hide picker if clicking on the document 
        $scope.hidePicker = function () {
            //$element.find("div:first").datetimepicker("hide");
            // Sometimes the statement above fails and generates errors in the browser console. The following statements fix that.
            var dtp = $element.find('div:first');
            if (dtp && dtp.datetimepicker) {
                dtp.datetimepicker('hide');
            }
        };
        $(document).bind('click', $scope.hidePicker);
        //here we declare a special method which will be called whenever the value has changed from the server
        //this is instead of doing a watch on the model.value = faster
        $scope.model.onValueChanged = function (newVal, oldVal) {
            if (newVal != oldVal) {
                //check for c# System.DateTime.MinValue being passed as the clear indicator
                var minDate = moment('0001-01-01');
                var newDate = moment(newVal);
                if (newDate.isAfter(minDate)) {
                    applyDate({ date: moment(newVal) });
                } else {
                    $scope.clearDate();
                }
            }
        };
        //handles the date changing via the api
        function applyDate(e) {
            angularHelper.safeApply($scope, function () {
                // when a date is changed, update the model
                if (e.date && e.date.isValid()) {
                    $scope.datePickerForm.datepicker.$setValidity('pickerError', true);
                    $scope.hasDatetimePickerValue = true;
                    $scope.datetimePickerValue = e.date.format($scope.model.config.format);
                } else {
                    $scope.hasDatetimePickerValue = false;
                    $scope.datetimePickerValue = null;
                }
                setModelValue();
                if (!$scope.model.config.pickTime) {
                    $element.find('div:first').datetimepicker('hide', 0);
                }
            });
        }
        //sets the scope model value accordingly - this is the value to be sent up to the server and depends on 
        // if the picker is configured to offset time. We always format the date/time in a specific format for sending
        // to the server, this is different from the format used to display the date/time.
        function setModelValue() {
            if ($scope.hasDatetimePickerValue) {
                var elementData = $element.find('div:first').data().DateTimePicker;
                if ($scope.model.config.pickTime) {
                    //check if we are supposed to offset the time
                    if ($scope.model.value && $scope.model.config.offsetTime === '1' && Umbraco.Sys.ServerVariables.application.serverTimeOffset !== undefined) {
                        $scope.model.value = dateHelper.convertToServerStringTime(elementData.getDate(), Umbraco.Sys.ServerVariables.application.serverTimeOffset);
                        $scope.serverTime = dateHelper.convertToServerStringTime(elementData.getDate(), Umbraco.Sys.ServerVariables.application.serverTimeOffset, 'YYYY-MM-DD HH:mm:ss Z');
                    } else {
                        $scope.model.value = elementData.getDate().format('YYYY-MM-DD HH:mm:ss');
                    }
                } else {
                    $scope.model.value = elementData.getDate().format('YYYY-MM-DD');
                }
            } else {
                $scope.model.value = null;
            }
        }
        var picker = null;
        $scope.clearDate = function () {
            $scope.hasDatetimePickerValue = false;
            $scope.datetimePickerValue = null;
            $scope.model.value = null;
            $scope.datePickerForm.datepicker.$setValidity('pickerError', true);
        };
        $scope.serverTime = null;
        $scope.serverTimeNeedsOffsetting = false;
        if (Umbraco.Sys.ServerVariables.application.serverTimeOffset !== undefined) {
            // Will return something like 120
            var serverOffset = Umbraco.Sys.ServerVariables.application.serverTimeOffset;
            // Will return something like -120
            var localOffset = new Date().getTimezoneOffset();
            // If these aren't equal then offsetting is needed
            // note the minus in front of serverOffset needed 
            // because C# and javascript return the inverse offset
            $scope.serverTimeNeedsOffsetting = -serverOffset !== localOffset;
        }
        //get the current user to see if we can localize this picker
        userService.getCurrentUser().then(function (user) {
            assetsService.loadCss('lib/datetimepicker/bootstrap-datetimepicker.min.css', $scope).then(function () {
                var filesToLoad = ['lib/datetimepicker/bootstrap-datetimepicker.js'];
                $scope.model.config.language = user.locale;
                assetsService.load(filesToLoad, $scope).then(function () {
                    //The Datepicker js and css files are available and all components are ready to use.
                    // Get the id of the datepicker button that was clicked
                    var pickerId = $scope.model.alias;
                    var element = $element.find('div:first');
                    // Open the datepicker and add a changeDate eventlistener
                    element.datetimepicker(angular.extend({ useCurrent: $scope.model.config.defaultEmpty !== '1' }, $scope.model.config)).on('dp.change', applyDate).on('dp.error', function (a, b, c) {
                        $scope.hasDatetimePickerValue = false;
                        $scope.datePickerForm.datepicker.$setValidity('pickerError', false);
                    });
                    if ($scope.hasDatetimePickerValue) {
                        var dateVal;
                        //check if we are supposed to offset the time
                        if ($scope.model.value && $scope.model.config.offsetTime === '1' && $scope.serverTimeNeedsOffsetting) {
                            //get the local time offset from the server
                            dateVal = dateHelper.convertToLocalMomentTime($scope.model.value, Umbraco.Sys.ServerVariables.application.serverTimeOffset);
                            $scope.serverTime = dateHelper.convertToServerStringTime(dateVal, Umbraco.Sys.ServerVariables.application.serverTimeOffset, 'YYYY-MM-DD HH:mm:ss Z');
                        } else {
                            //create a normal moment , no offset required
                            var dateVal = $scope.model.value ? moment($scope.model.value, 'YYYY-MM-DD HH:mm:ss') : moment();
                        }
                        element.datetimepicker('setValue', dateVal);
                        $scope.datetimePickerValue = dateVal.format($scope.model.config.format);
                    }
                    element.find('input').bind('blur', function () {
                        //we need to force an apply here
                        $scope.$apply();
                    });
                    //Ensure to remove the event handler when this instance is destroyted
                    $scope.$on('$destroy', function () {
                        element.find('input').unbind('blur');
                        element.datetimepicker('destroy');
                    });
                    var unsubscribe = $scope.$on('formSubmitting', function (ev, args) {
                        setModelValue();
                    });
                    //unbind doc click event!
                    $scope.$on('$destroy', function () {
                        unsubscribe();
                    });
                });
            });
        });
        var unsubscribe = $scope.$on('formSubmitting', function (ev, args) {
            setModelValue();
        });
        //unbind doc click event!
        $scope.$on('$destroy', function () {
            $(document).unbind('click', $scope.hidePicker);
            unsubscribe();
        });
    }
    angular.module('umbraco').controller('Umbraco.PropertyEditors.DatepickerController', dateTimePickerController);
    angular.module('umbraco').controller('Umbraco.PropertyEditors.DropdownController', function ($scope) {
        //setup the default config
        var config = {
            items: [],
            multiple: false
        };
        //map the user config
        angular.extend(config, $scope.model.config);
        //map back to the model
        $scope.model.config = config;
        function convertArrayToDictionaryArray(model) {
            //now we need to format the items in the dictionary because we always want to have an array
            var newItems = [];
            for (var i = 0; i < model.length; i++) {
                newItems.push({
                    id: model[i],
                    sortOrder: 0,
                    value: model[i]
                });
            }
            return newItems;
        }
        function convertObjectToDictionaryArray(model) {
            //now we need to format the items in the dictionary because we always want to have an array
            var newItems = [];
            var vals = _.values($scope.model.config.items);
            var keys = _.keys($scope.model.config.items);
            for (var i = 0; i < vals.length; i++) {
                var label = vals[i].value ? vals[i].value : vals[i];
                newItems.push({
                    id: keys[i],
                    sortOrder: vals[i].sortOrder,
                    value: label
                });
            }
            return newItems;
        }
        if (angular.isArray($scope.model.config.items)) {
            //PP: I dont think this will happen, but we have tests that expect it to happen..
            //if array is simple values, convert to array of objects
            if (!angular.isObject($scope.model.config.items[0])) {
                $scope.model.config.items = convertArrayToDictionaryArray($scope.model.config.items);
            }
        } else if (angular.isObject($scope.model.config.items)) {
            $scope.model.config.items = convertObjectToDictionaryArray($scope.model.config.items);
        } else {
            throw 'The items property must be either an array or a dictionary';
        }
        //sort the values
        $scope.model.config.items.sort(function (a, b) {
            return a.sortOrder > b.sortOrder ? 1 : b.sortOrder > a.sortOrder ? -1 : 0;
        });
        //now we need to check if the value is null/undefined, if it is we need to set it to "" so that any value that is set
        // to "" gets selected by default
        if ($scope.model.value === null || $scope.model.value === undefined) {
            if ($scope.model.config.multiple) {
                $scope.model.value = [];
            } else {
                $scope.model.value = '';
            }
        }
    });
    angular.module('umbraco').controller('Umbraco.PropertyEditors.DropdownFlexibleController', function ($scope) {
        //setup the default config
        var config = {
            items: [],
            multiple: false
        };
        //map the user config
        angular.extend(config, $scope.model.config);
        //map back to the model
        $scope.model.config = config;
        function convertArrayToDictionaryArray(model) {
            //now we need to format the items in the dictionary because we always want to have an array
            var newItems = [];
            for (var i = 0; i < model.length; i++) {
                newItems.push({
                    id: model[i],
                    sortOrder: 0,
                    value: model[i]
                });
            }
            return newItems;
        }
        function convertObjectToDictionaryArray(model) {
            //now we need to format the items in the dictionary because we always want to have an array
            var newItems = [];
            var vals = _.values($scope.model.config.items);
            var keys = _.keys($scope.model.config.items);
            for (var i = 0; i < vals.length; i++) {
                var label = vals[i].value ? vals[i].value : vals[i];
                newItems.push({
                    id: keys[i],
                    sortOrder: vals[i].sortOrder,
                    value: label
                });
            }
            return newItems;
        }
        $scope.updateSingleDropdownValue = function () {
            $scope.model.value = [$scope.model.singleDropdownValue];
        };
        if (angular.isArray($scope.model.config.items)) {
            //PP: I dont think this will happen, but we have tests that expect it to happen..
            //if array is simple values, convert to array of objects
            if (!angular.isObject($scope.model.config.items[0])) {
                $scope.model.config.items = convertArrayToDictionaryArray($scope.model.config.items);
            }
        } else if (angular.isObject($scope.model.config.items)) {
            $scope.model.config.items = convertObjectToDictionaryArray($scope.model.config.items);
        } else {
            throw 'The items property must be either an array or a dictionary';
        }
        //sort the values
        $scope.model.config.items.sort(function (a, b) {
            return a.sortOrder > b.sortOrder ? 1 : b.sortOrder > a.sortOrder ? -1 : 0;
        });
        //now we need to check if the value is null/undefined, if it is we need to set it to "" so that any value that is set
        // to "" gets selected by default
        if ($scope.model.value === null || $scope.model.value === undefined) {
            if ($scope.model.config.multiple) {
                $scope.model.value = [];
            } else {
                $scope.model.value = '';
            }
        }
        // if we run in single mode we'll store the value in a local variable
        // so we can pass an array as the model as our PropertyValueEditor expects that
        $scope.model.singleDropdownValue = '';
        if ($scope.model.config.multiple === '0' && $scope.model.value) {
            $scope.model.singleDropdownValue = Array.isArray($scope.model.value) ? $scope.model.value[0] : $scope.model.value;
        }
        // if we run in multiple mode, make sure the model is an array (in case the property was previously saved in single mode)
        // also explicitly set the model to null if it's an empty array, so mandatory validation works on the client
        if ($scope.model.config.multiple === '1' && $scope.model.value) {
            $scope.model.value = !Array.isArray($scope.model.value) ? [$scope.model.value] : $scope.model.value;
            if ($scope.model.value.length === 0) {
                $scope.model.value = null;
            }
        }
    });
    /** A drop down list or multi value select list based on an entity type, this can be re-used for any entity types */
    function entityPicker($scope, entityResource) {
        //set the default to DocumentType
        if (!$scope.model.config.entityType) {
            $scope.model.config.entityType = 'DocumentType';
        }
        //Determine the select list options and which value to publish
        if (!$scope.model.config.publishBy) {
            $scope.selectOptions = 'entity.id as entity.name for entity in entities';
        } else {
            $scope.selectOptions = 'entity.' + $scope.model.config.publishBy + ' as entity.name for entity in entities';
        }
        entityResource.getAll($scope.model.config.entityType).then(function (data) {
            //convert the ids to strings so the drop downs work properly when comparing
            _.each(data, function (d) {
                d.id = d.id.toString();
            });
            $scope.entities = data;
        });
        if ($scope.model.value === null || $scope.model.value === undefined) {
            if ($scope.model.config.multiple) {
                $scope.model.value = [];
            } else {
                $scope.model.value = '';
            }
        } else {
            //if it's multiple, change the value to an array
            if ($scope.model.config.multiple === '1') {
                if (_.isString($scope.model.value)) {
                    $scope.model.value = $scope.model.value.split(',');
                }
            }
        }
    }
    angular.module('umbraco').controller('Umbraco.PropertyEditors.EntityPickerController', entityPicker);
    /**
 * @ngdoc controller
 * @name Umbraco.Editors.FileUploadController
 * @function
 *
 * @description
 * The controller for the file upload property editor. It is important to note that the $scope.model.value
 *  doesn't necessarily depict what is saved for this property editor. $scope.model.value can be empty when we
 *  are submitting files because in that case, we are adding files to the fileManager which is what gets peristed
 *  on the server. However, when we are clearing files, we are setting $scope.model.value to "{clearFiles: true}"
 *  to indicate on the server that we are removing files for this property. We will keep the $scope.model.value to
 *  be the name of the file selected (if it is a newly selected file) or keep it to be it's original value, this allows
 *  for the editors to check if the value has changed and to re-bind the property if that is true.
 *
*/
    function fileUploadController($scope, $element, $compile, imageHelper, fileManager, umbRequestHelper, mediaHelper) {
        /** Clears the file collections when content is saving (if we need to clear) or after saved */
        function clearFiles() {
            //clear the files collection (we don't want to upload any!)
            fileManager.setFiles($scope.model.alias, []);
            //clear the current files
            $scope.files = [];
            if ($scope.propertyForm) {
                if ($scope.propertyForm.fileCount) {
                    //this is required to re-validate
                    $scope.propertyForm.fileCount.$setViewValue($scope.files.length);
                }
            }
        }
        /** this method is used to initialize the data and to re-initialize it if the server value is changed */
        function initialize(index) {
            clearFiles();
            if (!index) {
                index = 1;
            }
            //this is used in order to tell the umb-single-file-upload directive to
            //rebuild the html input control (and thus clearing the selected file) since
            //that is the only way to manipulate the html for the file input control.
            $scope.rebuildInput = { index: index };
            //clear the current files
            $scope.files = [];
            //store the original value so we can restore it if the user clears and then cancels clearing.
            $scope.originalValue = $scope.model.value;
            //create the property to show the list of files currently saved
            if ($scope.model.value != '' && $scope.model.value != undefined) {
                var images = $scope.model.value.split(',');
                $scope.persistedFiles = _.map(images, function (item) {
                    return {
                        file: item,
                        isImage: imageHelper.detectIfImageByExtension(item)
                    };
                });
            } else {
                $scope.persistedFiles = [];
            }
            _.each($scope.persistedFiles, function (file) {
                var thumbnailUrl = umbRequestHelper.getApiUrl('imagesApiBaseUrl', 'GetBigThumbnail', [{ originalImagePath: file.file }]);
                var extension = file.file.substring(file.file.lastIndexOf('.') + 1, file.file.length);
                file.thumbnail = thumbnailUrl + '&rnd=' + Math.random();
                file.extension = extension.toLowerCase();
            });
            $scope.clearFiles = false;
        }
        initialize();
        // Method required by the valPropertyValidator directive (returns true if the property editor has at least one file selected)
        $scope.validateMandatory = function () {
            return {
                isValid: !$scope.model.validation.mandatory || ($scope.persistedFiles != null && $scope.persistedFiles.length > 0 || $scope.files != null && $scope.files.length > 0) && !$scope.clearFiles,
                errorMsg: 'Value cannot be empty',
                errorKey: 'required'
            };
        };
        //listen for clear files changes to set our model to be sent up to the server
        $scope.$watch('clearFiles', function (isCleared) {
            if (isCleared == true) {
                $scope.model.value = { clearFiles: true };
                clearFiles();
            } else {
                //reset to original value
                $scope.model.value = $scope.originalValue;
                //this is required to re-validate
                if ($scope.propertyForm) {
                    $scope.propertyForm.fileCount.$setViewValue($scope.files.length);
                }
            }
        });
        //listen for when a file is selected
        $scope.$on('filesSelected', function (event, args) {
            $scope.$apply(function () {
                //set the files collection
                fileManager.setFiles($scope.model.alias, args.files);
                //clear the current files
                $scope.files = [];
                var newVal = '';
                for (var i = 0; i < args.files.length; i++) {
                    //save the file object to the scope's files collection
                    $scope.files.push({
                        alias: $scope.model.alias,
                        file: args.files[i]
                    });
                    newVal += args.files[i].name.split(',').join('-') + ',';
                }
                //this is required to re-validate
                $scope.propertyForm.fileCount.$setViewValue($scope.files.length);
                //set clear files to false, this will reset the model too
                $scope.clearFiles = false;
                //set the model value to be the concatenation of files selected. Please see the notes
                // in the description of this controller, it states that this value isn't actually used for persistence,
                // but we need to set it so that the editor and the server can detect that it's been changed, and it is used for validation.
                $scope.model.value = { selectedFiles: newVal.trimEnd(',') };
                //need to explicity setDirty here as file upload field can't track dirty & we can't use the fileCount (hidden field/model)
                $scope.propertyForm.$setDirty();
            });
        });
        //listen for when the model value has changed
        $scope.$watch('model.value', function (newVal, oldVal) {
            //cannot just check for !newVal because it might be an empty string which we
            //want to look for.
            if (newVal !== null && newVal !== undefined && newVal !== oldVal) {
                // here we need to check if the value change needs to trigger an update in the UI.
                // if the value is only changed in the controller and not in the server values, we do not
                // want to trigger an update yet.
                // we can however no longer rely on checking values in the controller vs. values from the server
                // to determine whether to update or not, since you could potentially be uploading a file with
                // the exact same name - in that case we need to reinitialize to show the newly uploaded file.
                if (newVal.clearFiles !== true && !newVal.selectedFiles) {
                    initialize($scope.rebuildInput.index + 1);
                }
            }
        });
    }
    ;
    angular.module('umbraco').controller('Umbraco.PropertyEditors.FileUploadController', fileUploadController).run(function (mediaHelper, umbRequestHelper, assetsService) {
        if (mediaHelper && mediaHelper.registerFileResolver) {
            //NOTE: The 'entity' can be either a normal media entity or an "entity" returned from the entityResource
            // they contain different data structures so if we need to query against it we need to be aware of this.
            mediaHelper.registerFileResolver('Umbraco.UploadField', function (property, entity, thumbnail) {
                if (thumbnail) {
                    if (mediaHelper.detectIfImageByExtension(property.value)) {
                        //get default big thumbnail from image processor
                        var thumbnailUrl = property.value + '?rnd=' + moment(entity.updateDate).format('YYYYMMDDHHmmss') + '&width=500&animationprocessmode=first';
                        return thumbnailUrl;
                    } else {
                        return null;
                    }
                } else {
                    return property.value;
                }
            });
        }
    });
    angular.module('umbraco')    //this controller is obsolete and should not be used anymore
                                 //it proxies everything to the system media list view which has overtaken
                                 //all the work this property editor used to perform
.controller('Umbraco.PropertyEditors.FolderBrowserController', function ($rootScope, $scope, contentTypeResource) {
        //get the system media listview
        contentTypeResource.getPropertyTypeScaffold(-96).then(function (dt) {
            $scope.fakeProperty = {
                alias: 'contents',
                config: dt.config,
                description: '',
                editor: dt.editor,
                hideLabel: true,
                id: 1,
                label: 'Contents:',
                validation: {
                    mandatory: false,
                    pattern: null
                },
                value: '',
                view: dt.view
            };
        });
    });
    angular.module('umbraco').controller('Umbraco.PropertyEditors.GoogleMapsController', function ($element, $rootScope, $scope, notificationsService, dialogService, assetsService, $log, $timeout) {
        assetsService.loadJs('https://www.google.com/jsapi', $scope).then(function () {
            google.load('maps', '3', {
                callback: initMap,
                other_params: 'sensor=false'
            });
        });
        function initMap() {
            //Google maps is available and all components are ready to use.
            var valueArray = $scope.model.value.split(',');
            var latLng = new google.maps.LatLng(valueArray[0], valueArray[1]);
            var mapDiv = document.getElementById($scope.model.alias + '_map');
            var mapOptions = {
                zoom: $scope.model.config.zoom,
                center: latLng,
                mapTypeId: google.maps.MapTypeId[$scope.model.config.mapType]
            };
            var geocoder = new google.maps.Geocoder();
            var map = new google.maps.Map(mapDiv, mapOptions);
            var marker = new google.maps.Marker({
                map: map,
                position: latLng,
                draggable: true
            });
            google.maps.event.addListener(map, 'click', function (event) {
                dialogService.mediaPicker({
                    callback: function (data) {
                        var image = data.selection[0].src;
                        var latLng = event.latLng;
                        var marker = new google.maps.Marker({
                            map: map,
                            icon: image,
                            position: latLng,
                            draggable: true
                        });
                        google.maps.event.addListener(marker, 'dragend', function (e) {
                            var newLat = marker.getPosition().lat();
                            var newLng = marker.getPosition().lng();
                            codeLatLng(marker.getPosition(), geocoder);
                            //set the model value
                            $scope.model.vvalue = newLat + ',' + newLng;
                        });
                    }
                });
            });
            var tabShown = function (e) {
                google.maps.event.trigger(map, 'resize');
            };
            //listen for tab changes
            if (tabsCtrl != null) {
                tabsCtrl.onTabShown(function (args) {
                    tabShown();
                });
            }
            $element.closest('.umb-panel.tabbable').on('shown', '.nav-tabs a', tabShown);
            $scope.$on('$destroy', function () {
                $element.closest('.umb-panel.tabbable').off('shown', '.nav-tabs a', tabShown);
            });
        }
        function codeLatLng(latLng, geocoder) {
            geocoder.geocode({ 'latLng': latLng }, function (results, status) {
                if (status == google.maps.GeocoderStatus.OK) {
                    var location = results[0].formatted_address;
                    $rootScope.$apply(function () {
                        notificationsService.success('Peter just went to: ', location);
                    });
                }
            });
        }
        //here we declare a special method which will be called whenever the value has changed from the server
        //this is instead of doing a watch on the model.value = faster
        $scope.model.onValueChanged = function (newVal, oldVal) {
            //update the display val again if it has changed from the server
            initMap();
        };
    });
    angular.module('umbraco').controller('Umbraco.PropertyEditors.GridPrevalueEditor.LayoutConfigController', function ($scope) {
        $scope.currentLayout = $scope.model.currentLayout;
        $scope.columns = $scope.model.columns;
        $scope.rows = $scope.model.rows;
        $scope.scaleUp = function (section, max, overflow) {
            var add = 1;
            if (overflow !== true) {
                add = max > 1 ? 1 : max;
            }
            //var add = (max > 1) ? 1 : max;
            section.grid = section.grid + add;
        };
        $scope.scaleDown = function (section) {
            var remove = section.grid > 1 ? 1 : 0;
            section.grid = section.grid - remove;
        };
        $scope.percentage = function (spans) {
            return (spans / $scope.columns * 100).toFixed(8);
        };
        /****************
    		    Section
    		*****************/
        $scope.configureSection = function (section, template) {
            if (section === undefined) {
                var space = $scope.availableLayoutSpace > 4 ? 4 : $scope.availableLayoutSpace;
                section = { grid: space };
                template.sections.push(section);
            }
            $scope.currentSection = section;
            $scope.currentSection.allowAll = section.allowAll || !section.allowed || !section.allowed.length;
        };
        $scope.toggleAllowed = function (section) {
            if (section.allowed) {
                delete section.allowed;
            } else {
                section.allowed = [];
            }
        };
        $scope.deleteSection = function (section, template) {
            if ($scope.currentSection === section) {
                $scope.currentSection = undefined;
            }
            var index = template.sections.indexOf(section);
            template.sections.splice(index, 1);
        };
        $scope.closeSection = function () {
            $scope.currentSection = undefined;
        };
        $scope.$watch('currentLayout', function (layout) {
            if (layout) {
                var total = 0;
                _.forEach(layout.sections, function (section) {
                    total = total + section.grid;
                });
                $scope.availableLayoutSpace = $scope.columns - total;
            }
        }, true);
    });
    function RowConfigController($scope) {
        $scope.currentRow = $scope.model.currentRow;
        $scope.editors = $scope.model.editors;
        $scope.columns = $scope.model.columns;
        $scope.scaleUp = function (section, max, overflow) {
            var add = 1;
            if (overflow !== true) {
                add = max > 1 ? 1 : max;
            }
            //var add = (max > 1) ? 1 : max;
            section.grid = section.grid + add;
        };
        $scope.scaleDown = function (section) {
            var remove = section.grid > 1 ? 1 : 0;
            section.grid = section.grid - remove;
        };
        $scope.percentage = function (spans) {
            return (spans / $scope.columns * 100).toFixed(8);
        };
        /****************
        area
    *****************/
        $scope.configureCell = function (cell, row) {
            if ($scope.currentCell && $scope.currentCell === cell) {
                delete $scope.currentCell;
            } else {
                if (cell === undefined) {
                    var available = $scope.availableRowSpace;
                    var space = 4;
                    if (available < 4 && available > 0) {
                        space = available;
                    }
                    cell = { grid: space };
                    row.areas.push(cell);
                }
                $scope.currentCell = cell;
                $scope.currentCell.allowAll = cell.allowAll || !cell.allowed || !cell.allowed.length;
            }
        };
        $scope.toggleAllowed = function (cell) {
            if (cell.allowed) {
                delete cell.allowed;
            } else {
                cell.allowed = [];
            }
        };
        $scope.deleteArea = function (cell, row) {
            if ($scope.currentCell === cell) {
                $scope.currentCell = undefined;
            }
            var index = row.areas.indexOf(cell);
            row.areas.splice(index, 1);
        };
        $scope.closeArea = function () {
            $scope.currentCell = undefined;
        };
        $scope.nameChanged = false;
        var originalName = $scope.currentRow.name;
        $scope.$watch('currentRow', function (row) {
            if (row) {
                var total = 0;
                _.forEach(row.areas, function (area) {
                    total = total + area.grid;
                });
                $scope.availableRowSpace = $scope.columns - total;
                if (originalName) {
                    if (originalName != row.name) {
                        $scope.nameChanged = true;
                    } else {
                        $scope.nameChanged = false;
                    }
                }
            }
        }, true);
    }
    angular.module('umbraco').controller('Umbraco.PropertyEditors.GridPrevalueEditor.RowConfigController', RowConfigController);
    angular.module('umbraco').controller('Umbraco.PropertyEditors.Grid.EmbedController', function ($scope, $rootScope, $timeout) {
        $scope.setEmbed = function () {
            $scope.embedDialog = {};
            $scope.embedDialog.view = 'embed';
            $scope.embedDialog.show = true;
            $scope.embedDialog.submit = function (model) {
                $scope.control.value = model.embed.preview;
                $scope.embedDialog.show = false;
                $scope.embedDialog = null;
            };
            $scope.embedDialog.close = function (oldModel) {
                $scope.embedDialog.show = false;
                $scope.embedDialog = null;
            };
        };
        $timeout(function () {
            if ($scope.control.$initializing) {
                $scope.setEmbed();
            }
        }, 200);
    });
    angular.module('umbraco').controller('Umbraco.PropertyEditors.Grid.MacroController', function ($scope, $rootScope, $timeout, dialogService, macroResource, macroService, $routeParams) {
        $scope.title = 'Click to insert macro';
        $scope.setMacro = function () {
            var dialogData = {
                richTextEditor: true,
                macroData: $scope.control.value || { macroAlias: $scope.control.editor.config && $scope.control.editor.config.macroAlias ? $scope.control.editor.config.macroAlias : '' }
            };
            $scope.macroPickerOverlay = {};
            $scope.macroPickerOverlay.view = 'macropicker';
            $scope.macroPickerOverlay.dialogData = dialogData;
            $scope.macroPickerOverlay.show = true;
            $scope.macroPickerOverlay.submit = function (model) {
                var macroObject = macroService.collectValueData(model.selectedMacro, model.macroParams, dialogData.renderingEngine);
                $scope.control.value = {
                    macroAlias: macroObject.macroAlias,
                    macroParamsDictionary: macroObject.macroParamsDictionary
                };
                $scope.setPreview($scope.control.value);
                $scope.macroPickerOverlay.show = false;
                $scope.macroPickerOverlay = null;
            };
            $scope.macroPickerOverlay.close = function (oldModel) {
                $scope.macroPickerOverlay.show = false;
                $scope.macroPickerOverlay = null;
            };
        };
        $scope.setPreview = function (macro) {
            var contentId = $routeParams.id;
            macroResource.getMacroResultAsHtmlForEditor(macro.macroAlias, contentId, macro.macroParamsDictionary).then(function (htmlResult) {
                $scope.title = macro.macroAlias;
                if (htmlResult.trim().length > 0 && htmlResult.indexOf('Macro:') < 0) {
                    $scope.preview = htmlResult;
                }
            });
        };
        $timeout(function () {
            if ($scope.control.$initializing) {
                $scope.setMacro();
            } else if ($scope.control.value) {
                $scope.setPreview($scope.control.value);
            }
        }, 200);
    });
    angular.module('umbraco').controller('Umbraco.PropertyEditors.Grid.MediaController', function ($scope, $rootScope, $timeout, userService) {
        if (!$scope.model.config.startNodeId) {
            if ($scope.model.config.ignoreUserStartNodes === '1') {
                $scope.model.config.startNodeId = -1;
                $scope.model.config.startNodeIsVirtual = true;
            } else {
                userService.getCurrentUser().then(function (userData) {
                    $scope.model.config.startNodeId = userData.startMediaIds.length !== 1 ? -1 : userData.startMediaIds[0];
                    $scope.model.config.startNodeIsVirtual = userData.startMediaIds.length !== 1;
                });
            }
        }
        $scope.setImage = function () {
            $scope.mediaPickerOverlay = {};
            $scope.mediaPickerOverlay.view = 'mediapicker';
            $scope.mediaPickerOverlay.startNodeId = $scope.model.config && $scope.model.config.startNodeId ? $scope.model.config.startNodeId : null;
            $scope.mediaPickerOverlay.startNodeIsVirtual = $scope.mediaPickerOverlay.startNodeId ? $scope.model.config.startNodeIsVirtual : null;
            $scope.mediaPickerOverlay.dataTypeId = $scope.model && $scope.model.dataTypeId ? $scope.model.dataTypeId : null;
            $scope.mediaPickerOverlay.cropSize = $scope.control.editor.config && $scope.control.editor.config.size ? $scope.control.editor.config.size : null;
            $scope.mediaPickerOverlay.showDetails = true;
            $scope.mediaPickerOverlay.disableFolderSelect = true;
            $scope.mediaPickerOverlay.onlyImages = true;
            $scope.mediaPickerOverlay.show = true;
            $scope.mediaPickerOverlay.submit = function (model) {
                var selectedImage = model.selectedImages[0];
                $scope.control.value = {
                    focalPoint: selectedImage.focalPoint,
                    id: selectedImage.id,
                    udi: selectedImage.udi,
                    image: selectedImage.image,
                    altText: selectedImage.altText
                };
                $scope.setUrl();
                $scope.mediaPickerOverlay.show = false;
                $scope.mediaPickerOverlay = null;
            };
            $scope.mediaPickerOverlay.close = function (oldModel) {
                $scope.mediaPickerOverlay.show = false;
                $scope.mediaPickerOverlay = null;
            };
        };
        $scope.setUrl = function () {
            if ($scope.control.value.image) {
                var url = $scope.control.value.image;
                if ($scope.control.editor.config && $scope.control.editor.config.size) {
                    url += '?width=' + $scope.control.editor.config.size.width;
                    url += '&height=' + $scope.control.editor.config.size.height;
                    url += '&animationprocessmode=first';
                    if ($scope.control.value.focalPoint) {
                        url += '&center=' + $scope.control.value.focalPoint.top + ',' + $scope.control.value.focalPoint.left;
                        url += '&mode=crop';
                    }
                }
                // set default size if no crop present (moved from the view)
                if (url.indexOf('?') == -1) {
                    url += '?width=800&upscale=false&animationprocessmode=false';
                }
                $scope.url = url;
            }
        };
        $timeout(function () {
            if ($scope.control.$initializing) {
                $scope.setImage();
            } else if ($scope.control.value) {
                $scope.setUrl();
            }
        }, 200);
    });
    (function () {
        'use strict';
        function GridRichTextEditorController($scope, tinyMceService, macroService, editorState, entityResource) {
            var vm = this;
            vm.openLinkPicker = openLinkPicker;
            vm.openMediaPicker = openMediaPicker;
            vm.openMacroPicker = openMacroPicker;
            vm.openEmbed = openEmbed;
            var dataTypeId = $scope.model && $scope.model.dataTypeId ? $scope.model.dataTypeId : null;
            function openLinkPicker(editor, currentTarget, anchorElement) {
                entityResource.getAnchors(JSON.stringify($scope.model.value)).then(function (anchorValues) {
                    vm.linkPickerOverlay = {
                        view: 'linkpicker',
                        currentTarget: currentTarget,
                        anchors: anchorValues,
                        dataTypeId: dataTypeId,
                        ignoreUserStartNodes: $scope.model.config.ignoreUserStartNodes,
                        show: true,
                        submit: function (model) {
                            tinyMceService.insertLinkInEditor(editor, model.target, anchorElement);
                            vm.linkPickerOverlay.show = false;
                            vm.linkPickerOverlay = null;
                        }
                    };
                });
            }
            function openMediaPicker(editor, currentTarget, userData) {
                var startNodeId = userData.startMediaIds.length !== 1 ? -1 : userData.startMediaIds[0];
                var startNodeIsVirtual = userData.startMediaIds.length !== 1;
                if ($scope.model.config.ignoreUserStartNodes === '1') {
                    startNodeId = -1;
                    startNodeIsVirtual = true;
                }
                vm.mediaPickerOverlay = {
                    currentTarget: currentTarget,
                    onlyImages: true,
                    showDetails: true,
                    startNodeId: startNodeId,
                    startNodeIsVirtual: startNodeIsVirtual,
                    dataTypeId: dataTypeId,
                    view: 'mediapicker',
                    show: true,
                    submit: function (model) {
                        tinyMceService.insertMediaInEditor(editor, model.selectedImages[0]);
                        vm.mediaPickerOverlay.show = false;
                        vm.mediaPickerOverlay = null;
                    }
                };
            }
            function openEmbed(editor) {
                vm.embedOverlay = {
                    view: 'embed',
                    show: true,
                    submit: function (model) {
                        tinyMceService.insertEmbeddedMediaInEditor(editor, model.embed.preview);
                        vm.embedOverlay.show = false;
                        vm.embedOverlay = null;
                    }
                };
            }
            function openMacroPicker(editor, dialogData) {
                vm.macroPickerOverlay = {
                    view: 'macropicker',
                    dialogData: dialogData,
                    show: true,
                    submit: function (model) {
                        var macroObject = macroService.collectValueData(model.selectedMacro, model.macroParams, dialogData.renderingEngine);
                        tinyMceService.insertMacroInEditor(editor, macroObject, $scope);
                        vm.macroPickerOverlay.show = false;
                        vm.macroPickerOverlay = null;
                    }
                };
            }
        }
        angular.module('umbraco').controller('Umbraco.PropertyEditors.Grid.RichTextEditorController', GridRichTextEditorController);
    }());
    angular.module('umbraco').controller('Umbraco.PropertyEditors.Grid.TextStringController', function ($scope, $rootScope, $timeout, dialogService) {
    });
    angular.module('umbraco').controller('Umbraco.PropertyEditors.GridController', function ($scope, $http, assetsService, localizationService, $rootScope, dialogService, gridService, mediaResource, imageHelper, $timeout, umbRequestHelper, angularHelper, $element, eventsService) {
        // Grid status variables
        var placeHolder = '';
        var currentForm = angularHelper.getCurrentForm($scope);
        $scope.currentRow = null;
        $scope.currentCell = null;
        $scope.currentToolsControl = null;
        $scope.currentControl = null;
        $scope.openRTEToolbarId = null;
        $scope.hasSettings = false;
        $scope.showRowConfigurations = true;
        $scope.sortMode = false;
        $scope.reorderKey = 'general_reorder';
        // *********************************************
        // Sortable options
        // *********************************************
        var draggedRteSettings;
        $scope.sortableOptionsRow = {
            distance: 10,
            cursor: 'move',
            placeholder: 'ui-sortable-placeholder',
            handle: '.umb-row-title-bar',
            helper: 'clone',
            forcePlaceholderSize: true,
            tolerance: 'pointer',
            zIndex: 1000000000000000000,
            scrollSensitivity: 100,
            cursorAt: {
                top: 40,
                left: 60
            },
            sort: function (event, ui) {
                /* prevent vertical scroll out of the screen */
                var max = $('.umb-grid').width() - 150;
                if (parseInt(ui.helper.css('left')) > max) {
                    ui.helper.css({ 'left': max + 'px' });
                }
                if (parseInt(ui.helper.css('left')) < 20) {
                    ui.helper.css({ 'left': 20 });
                }
            },
            start: function (e, ui) {
                // Fade out row when sorting
                ui.item.context.style.display = 'block';
                ui.item.context.style.opacity = '0.5';
                draggedRteSettings = {};
                ui.item.find('.mceNoEditor').each(function () {
                    // remove all RTEs in the dragged row and save their settings
                    var id = $(this).attr('id');
                    draggedRteSettings[id] = _.findWhere(tinyMCE.editors, { id: id }).settings;    // tinyMCE.execCommand("mceRemoveEditor", false, id);
                });
            },
            stop: function (e, ui) {
                // Fade in row when sorting stops
                ui.item.context.style.opacity = '1';
                // reset all RTEs affected by the dragging
                ui.item.parents('.umb-column').find('.mceNoEditor').each(function () {
                    var id = $(this).attr('id');
                    draggedRteSettings[id] = draggedRteSettings[id] || _.findWhere(tinyMCE.editors, { id: id }).settings;
                    tinyMCE.execCommand('mceRemoveEditor', false, id);
                    tinyMCE.init(draggedRteSettings[id]);
                });
                currentForm.$setDirty();
            }
        };
        var notIncludedRte = [];
        var cancelMove = false;
        var startingArea;
        $scope.sortableOptionsCell = {
            distance: 10,
            cursor: 'move',
            placeholder: 'ui-sortable-placeholder',
            handle: '.umb-control-handle',
            helper: 'clone',
            connectWith: '.umb-cell-inner',
            forcePlaceholderSize: true,
            tolerance: 'pointer',
            zIndex: 1000000000000000000,
            scrollSensitivity: 100,
            cursorAt: {
                top: 45,
                left: 90
            },
            sort: function (event, ui) {
                /* prevent vertical scroll out of the screen */
                var position = parseInt(ui.item.parent().offset().left) + parseInt(ui.helper.css('left')) - parseInt($('.umb-grid').offset().left);
                var max = $('.umb-grid').width() - 220;
                if (position > max) {
                    ui.helper.css({ 'left': max - parseInt(ui.item.parent().offset().left) + parseInt($('.umb-grid').offset().left) + 'px' });
                }
                if (position < 0) {
                    ui.helper.css({ 'left': 0 - parseInt(ui.item.parent().offset().left) + parseInt($('.umb-grid').offset().left) + 'px' });
                }
            },
            over: function (event, ui) {
                var area = $(event.target).scope().area;
                var allowedEditors = area.allowed;
                if ($.inArray(ui.item.scope().control.editor.alias, allowedEditors) < 0 && allowedEditors || startingArea != area && area.maxItems != '' && area.maxItems > 0 && area.maxItems < area.controls.length + 1) {
                    $scope.$apply(function () {
                        $(event.target).scope().area.dropNotAllowed = true;
                    });
                    ui.placeholder.hide();
                    cancelMove = true;
                } else {
                    if ($(event.target).scope().area.controls.length == 0) {
                        $scope.$apply(function () {
                            $(event.target).scope().area.dropOnEmpty = true;
                        });
                        ui.placeholder.hide();
                    } else {
                        ui.placeholder.show();
                    }
                    cancelMove = false;
                }
            },
            out: function (event, ui) {
                $scope.$apply(function () {
                    $(event.target).scope().area.dropNotAllowed = false;
                    $(event.target).scope().area.dropOnEmpty = false;
                });
            },
            update: function (event, ui) {
                /* add all RTEs which are affected by the dragging */
                if (!ui.sender) {
                    if (cancelMove) {
                        ui.item.sortable.cancel();
                    }
                    ui.item.parents('.umb-cell.content').find('.mceNoEditor').each(function () {
                        if ($.inArray($(this).attr('id'), notIncludedRte) < 0) {
                            notIncludedRte.splice(0, 0, $(this).attr('id'));
                        }
                    });
                } else {
                    $(event.target).find('.mceNoEditor').each(function () {
                        if ($.inArray($(this).attr('id'), notIncludedRte) < 0) {
                            notIncludedRte.splice(0, 0, $(this).attr('id'));
                        }
                    });
                }
                currentForm.$setDirty();
            },
            start: function (e, ui) {
                //Get the starting area for reference
                var area = $(e.target).scope().area;
                startingArea = area;
                // fade out control when sorting
                ui.item.context.style.display = 'block';
                ui.item.context.style.opacity = '0.5';
                // reset dragged RTE settings in case a RTE isn't dragged
                draggedRteSettings = undefined;
                ui.item.context.style.display = 'block';
                ui.item.find('.mceNoEditor').each(function () {
                    notIncludedRte = [];
                    var editors = _.findWhere(tinyMCE.editors, { id: $(this).attr('id') });
                    // save the dragged RTE settings
                    if (editors) {
                        draggedRteSettings = editors.settings;
                        // remove the dragged RTE
                        tinyMCE.execCommand('mceRemoveEditor', false, $(this).attr('id'));
                    }
                });
            },
            stop: function (e, ui) {
                // Fade in control when sorting stops
                ui.item.context.style.opacity = '1';
                ui.item.offsetParent().find('.mceNoEditor').each(function () {
                    if ($.inArray($(this).attr('id'), notIncludedRte) < 0) {
                        // add all dragged's neighbouring RTEs in the new cell
                        notIncludedRte.splice(0, 0, $(this).attr('id'));
                    }
                });
                $timeout(function () {
                    // reconstruct the dragged RTE (could be undefined when dragging something else than RTE)
                    if (draggedRteSettings !== undefined) {
                        tinyMCE.init(draggedRteSettings);
                    }
                    _.forEach(notIncludedRte, function (id) {
                        // reset all the other RTEs
                        if (draggedRteSettings === undefined || id !== draggedRteSettings.id) {
                            var rteSettings = _.findWhere(tinyMCE.editors, { id: id }).settings;
                            tinyMCE.execCommand('mceRemoveEditor', false, id);
                            tinyMCE.init(rteSettings);
                        }
                    });
                }, 500, false);
                $scope.$apply(function () {
                    var cell = $(e.target).scope().area;
                    cell.hasActiveChild = hasActiveChild(cell, cell.controls);
                    cell.active = false;
                });
            }
        };
        $scope.toggleSortMode = function () {
            $scope.sortMode = !$scope.sortMode;
            if ($scope.sortMode) {
                $scope.reorderKey = 'general_reorderDone';
            } else {
                $scope.reorderKey = 'general_reorder';
            }
        };
        $scope.showReorderButton = function () {
            if ($scope.model.value && $scope.model.value.sections) {
                for (var i = 0; $scope.model.value.sections.length > i; i++) {
                    var section = $scope.model.value.sections[i];
                    if (section.rows && section.rows.length > 0) {
                        return true;
                    }
                }
            }
        };
        // *********************************************
        // Add items overlay menu
        // *********************************************
        $scope.openEditorOverlay = function (event, area, index, key) {
            $scope.editorOverlay = {
                view: 'itempicker',
                filter: area.$allowedEditors.length > 15,
                title: localizationService.localize('grid_insertControl'),
                availableItems: area.$allowedEditors,
                event: event,
                show: true,
                submit: function (model) {
                    if (model.selectedItem) {
                        $scope.addControl(model.selectedItem, area, index);
                        $scope.editorOverlay.show = false;
                        $scope.editorOverlay = null;
                    }
                }
            };
        };
        // *********************************************
        // Template management functions
        // *********************************************
        $scope.addTemplate = function (template) {
            $scope.model.value = angular.copy(template);
            //default row data
            _.forEach($scope.model.value.sections, function (section) {
                $scope.initSection(section);
            });
        };
        // *********************************************
        // Row management function
        // *********************************************
        $scope.clickRow = function (index, rows) {
            rows[index].active = true;
        };
        $scope.clickOutsideRow = function (index, rows) {
            rows[index].active = false;
        };
        function getAllowedLayouts(section) {
            var layouts = $scope.model.config.items.layouts;
            //This will occur if it is a new section which has been
            // created from a 'template'
            if (section.allowed && section.allowed.length > 0) {
                return _.filter(layouts, function (layout) {
                    return _.indexOf(section.allowed, layout.name) >= 0;
                });
            } else {
                return layouts;
            }
        }
        $scope.addRow = function (section, layout, isInit) {
            //copy the selected layout into the rows collection
            var row = angular.copy(layout);
            // Init row value
            row = $scope.initRow(row);
            // Push the new row
            if (row) {
                section.rows.push(row);
            }
            if (!isInit) {
                currentForm.$setDirty();
            }
            $scope.showRowConfigurations = false;
            eventsService.emit('grid.rowAdded', {
                scope: $scope,
                element: $element,
                row: row
            });
        };
        $scope.removeRow = function (section, $index) {
            if (section.rows.length > 0) {
                section.rows.splice($index, 1);
                $scope.currentRow = null;
                $scope.openRTEToolbarId = null;
                currentForm.$setDirty();
            }
            if (section.rows.length === 0) {
                $scope.showRowConfigurations = true;
            }
        };
        var shouldApply = function (item, itemType, gridItem) {
            if (item.applyTo === undefined || item.applyTo === null || item.applyTo === '') {
                return true;
            }
            if (typeof item.applyTo === 'string') {
                return item.applyTo === itemType;
            }
            if (itemType === 'row') {
                if (item.applyTo.row === undefined) {
                    return false;
                }
                if (item.applyTo.row === null || item.applyTo.row === '') {
                    return true;
                }
                var rows = item.applyTo.row.split(',');
                return _.indexOf(rows, gridItem.name) !== -1;
            } else if (itemType === 'cell') {
                if (item.applyTo.cell === undefined) {
                    return false;
                }
                if (item.applyTo.cell === null || item.applyTo.cell === '') {
                    return true;
                }
                var cells = item.applyTo.cell.split(',');
                var cellSize = gridItem.grid.toString();
                return _.indexOf(cells, cellSize) !== -1;
            }
        };
        $scope.editGridItemSettings = function (gridItem, itemType) {
            placeHolder = '{0}';
            var styles, config;
            if (itemType === 'control') {
                styles = null;
                config = angular.copy(gridItem.editor.config.settings);
            } else {
                styles = _.filter(angular.copy($scope.model.config.items.styles), function (item) {
                    return shouldApply(item, itemType, gridItem);
                });
                config = _.filter(angular.copy($scope.model.config.items.config), function (item) {
                    return shouldApply(item, itemType, gridItem);
                });
            }
            if (angular.isObject(gridItem.config)) {
                _.each(config, function (cfg) {
                    var val = gridItem.config[cfg.key];
                    if (val) {
                        cfg.value = stripModifier(val, cfg.modifier);
                    }
                });
            }
            if (angular.isObject(gridItem.styles)) {
                _.each(styles, function (style) {
                    var val = gridItem.styles[style.key];
                    if (val) {
                        style.value = stripModifier(val, style.modifier);
                    }
                });
            }
            $scope.gridItemSettingsDialog = {};
            $scope.gridItemSettingsDialog.view = 'views/propertyeditors/grid/dialogs/config.html';
            $scope.gridItemSettingsDialog.title = 'Settings';
            $scope.gridItemSettingsDialog.styles = styles;
            $scope.gridItemSettingsDialog.config = config;
            $scope.gridItemSettingsDialog.show = true;
            $scope.gridItemSettingsDialog.submit = function (model) {
                var styleObject = {};
                var configObject = {};
                _.each(model.styles, function (style) {
                    if (style.value) {
                        styleObject[style.key] = addModifier(style.value, style.modifier);
                    }
                });
                _.each(model.config, function (cfg) {
                    if (cfg.value) {
                        configObject[cfg.key] = addModifier(cfg.value, cfg.modifier);
                    }
                });
                gridItem.styles = styleObject;
                gridItem.config = configObject;
                gridItem.hasConfig = gridItemHasConfig(styleObject, configObject);
                currentForm.$setDirty();
                $scope.gridItemSettingsDialog.show = false;
                $scope.gridItemSettingsDialog = null;
            };
            $scope.gridItemSettingsDialog.close = function (oldModel) {
                $scope.gridItemSettingsDialog.show = false;
                $scope.gridItemSettingsDialog = null;
            };
        };
        function stripModifier(val, modifier) {
            if (!val || !modifier || modifier.indexOf(placeHolder) < 0) {
                return val;
            } else {
                var paddArray = modifier.split(placeHolder);
                if (paddArray.length == 1) {
                    if (modifier.indexOf(placeHolder) === 0) {
                        return val.slice(0, -paddArray[0].length);
                    } else {
                        return val.slice(paddArray[0].length, 0);
                    }
                } else {
                    if (paddArray[1].length === 0) {
                        return val.slice(paddArray[0].length);
                    }
                    return val.slice(paddArray[0].length, -paddArray[1].length);
                }
            }
        }
        var addModifier = function (val, modifier) {
            if (!modifier || modifier.indexOf(placeHolder) < 0) {
                return val;
            } else {
                return modifier.replace(placeHolder, val);
            }
        };
        function gridItemHasConfig(styles, config) {
            if (_.isEmpty(styles) && _.isEmpty(config)) {
                return false;
            } else {
                return true;
            }
        }
        // *********************************************
        // Area management functions
        // *********************************************
        $scope.clickCell = function (index, cells, row) {
            cells[index].active = true;
            row.hasActiveChild = true;
        };
        $scope.clickOutsideCell = function (index, cells, row) {
            cells[index].active = false;
            row.hasActiveChild = hasActiveChild(row, cells);
        };
        $scope.cellPreview = function (cell) {
            if (cell && cell.$allowedEditors) {
                var editor = cell.$allowedEditors[0];
                return editor.icon;
            } else {
                return 'icon-layout';
            }
        };
        // *********************************************
        // Control management functions
        // *********************************************
        $scope.clickControl = function (index, controls, cell) {
            controls[index].active = true;
            cell.hasActiveChild = true;
        };
        $scope.clickOutsideControl = function (index, controls, cell) {
            controls[index].active = false;
            cell.hasActiveChild = hasActiveChild(cell, controls);
        };
        function hasActiveChild(item, children) {
            var activeChild = false;
            for (var i = 0; children.length > i; i++) {
                var child = children[i];
                if (child.active) {
                    activeChild = true;
                }
            }
            if (activeChild) {
                return true;
            }
        }
        var guid = function () {
            function s4() {
                return Math.floor((1 + Math.random()) * 65536).toString(16).substring(1);
            }
            return function () {
                return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4();
            };
        }();
        $scope.setUniqueId = function (cell, index) {
            return guid();
        };
        $scope.addControl = function (editor, cell, index, initialize) {
            initialize = initialize !== false;
            var newControl = {
                value: null,
                editor: editor,
                $initializing: initialize
            };
            if (index === undefined) {
                index = cell.controls.length;
            }
            newControl.active = true;
            //populate control
            $scope.initControl(newControl, index + 1);
            cell.controls.push(newControl);
            eventsService.emit('grid.itemAdded', {
                scope: $scope,
                element: $element,
                cell: cell,
                item: newControl
            });
        };
        $scope.addTinyMce = function (cell) {
            var rte = $scope.getEditor('rte');
            $scope.addControl(rte, cell);
        };
        $scope.getEditor = function (alias) {
            return _.find($scope.availableEditors, function (editor) {
                return editor.alias === alias;
            });
        };
        $scope.removeControl = function (cell, $index) {
            $scope.currentControl = null;
            cell.controls.splice($index, 1);
        };
        $scope.percentage = function (spans) {
            return (spans / $scope.model.config.items.columns * 100).toFixed(8);
        };
        $scope.clearPrompt = function (scopedObject, e) {
            scopedObject.deletePrompt = false;
            e.preventDefault();
            e.stopPropagation();
        };
        $scope.togglePrompt = function (scopedObject) {
            scopedObject.deletePrompt = !scopedObject.deletePrompt;
        };
        $scope.hidePrompt = function (scopedObject) {
            scopedObject.deletePrompt = false;
        };
        $scope.toggleAddRow = function () {
            $scope.showRowConfigurations = !$scope.showRowConfigurations;
        };
        // *********************************************
        // Initialization
        // these methods are called from ng-init on the template
        // so we can controll their first load data
        //
        // intialization sets non-saved data like percentage sizing, allowed editors and
        // other data that should all be pre-fixed with $ to strip it out on save
        // *********************************************
        // *********************************************
        // Init template + sections
        // *********************************************
        $scope.initContent = function () {
            var clear = true;
            //settings indicator shortcut
            if ($scope.model.config.items.config && $scope.model.config.items.config.length > 0 || $scope.model.config.items.styles && $scope.model.config.items.styles.length > 0) {
                $scope.hasSettings = true;
            }
            //ensure the grid has a column value set,
            //if nothing is found, set it to 12
            if (!$scope.model.config.items.columns) {
                $scope.model.config.items.columns = 12;
            } else if (angular.isString($scope.model.config.items.columns)) {
                $scope.model.config.items.columns = parseInt($scope.model.config.items.columns);
            }
            if ($scope.model.value && $scope.model.value.sections && $scope.model.value.sections.length > 0 && $scope.model.value.sections[0].rows && $scope.model.value.sections[0].rows.length > 0) {
                if ($scope.model.value.name && angular.isArray($scope.model.config.items.templates)) {
                    //This will occur if it is an existing value, in which case
                    // we need to determine which layout was applied by looking up
                    // the name
                    // TODO: We need to change this to an immutable ID!!
                    var found = _.find($scope.model.config.items.templates, function (t) {
                        return t.name === $scope.model.value.name;
                    });
                    if (found && angular.isArray(found.sections) && found.sections.length === $scope.model.value.sections.length) {
                        //Cool, we've found the template associated with our current value with matching sections counts, now we need to
                        // merge this template data on to our current value (as if it was new) so that we can preserve what is and isn't
                        // allowed for this template based on the current config.
                        _.each(found.sections, function (templateSection, index) {
                            angular.extend($scope.model.value.sections[index], angular.copy(templateSection));
                        });
                    }
                }
                _.forEach($scope.model.value.sections, function (section, index) {
                    if (section.grid > 0) {
                        $scope.initSection(section);
                        //we do this to ensure that the grid can be reset by deleting the last row
                        if (section.rows.length > 0) {
                            clear = false;
                        }
                    } else {
                        $scope.model.value.sections.splice(index, 1);
                    }
                });
            } else if ($scope.model.config.items.templates && $scope.model.config.items.templates.length === 1) {
                $scope.addTemplate($scope.model.config.items.templates[0]);
                clear = false;
            }
            if (clear) {
                $scope.model.value = undefined;
            }
        };
        $scope.initSection = function (section) {
            section.$percentage = $scope.percentage(section.grid);
            section.$allowedLayouts = getAllowedLayouts(section);
            if (!section.rows || section.rows.length === 0) {
                section.rows = [];
                if (section.$allowedLayouts.length === 1) {
                    $scope.addRow(section, section.$allowedLayouts[0], true);
                }
            } else {
                _.forEach(section.rows, function (row, index) {
                    if (!row.$initialized) {
                        var initd = $scope.initRow(row);
                        //if init fails, remove
                        if (!initd) {
                            section.rows.splice(index, 1);
                        } else {
                            section.rows[index] = initd;
                        }
                    }
                });
                // if there is more than one row added - hide row add tools
                $scope.showRowConfigurations = false;
            }
        };
        // *********************************************
        // Init layout / row
        // *********************************************
        $scope.initRow = function (row) {
            //merge the layout data with the original config data
            //if there are no config info on this, splice it out
            var original = _.find($scope.model.config.items.layouts, function (o) {
                return o.name === row.name;
            });
            if (!original) {
                return null;
            } else {
                //make a copy to not touch the original config
                original = angular.copy(original);
                original.styles = row.styles;
                original.config = row.config;
                original.hasConfig = gridItemHasConfig(row.styles, row.config);
                //sync area configuration
                _.each(original.areas, function (area, areaIndex) {
                    if (area.grid > 0) {
                        var currentArea = row.areas[areaIndex];
                        if (currentArea) {
                            area.config = currentArea.config;
                            area.styles = currentArea.styles;
                            area.hasConfig = gridItemHasConfig(currentArea.styles, currentArea.config);
                        }
                        //set editor permissions
                        if (!area.allowed || area.allowAll === true) {
                            area.$allowedEditors = $scope.availableEditors;
                            area.$allowsRTE = true;
                        } else {
                            area.$allowedEditors = _.filter($scope.availableEditors, function (editor) {
                                return _.indexOf(area.allowed, editor.alias) >= 0;
                            });
                            if (_.indexOf(area.allowed, 'rte') >= 0) {
                                area.$allowsRTE = true;
                            }
                        }
                        //copy over existing controls into the new areas
                        if (row.areas.length > areaIndex && row.areas[areaIndex].controls) {
                            area.controls = currentArea.controls;
                            _.forEach(area.controls, function (control, controlIndex) {
                                $scope.initControl(control, controlIndex);
                            });
                        } else {
                            //if empty
                            area.controls = [];
                            //if only one allowed editor
                            if (area.$allowedEditors.length === 1) {
                                $scope.addControl(area.$allowedEditors[0], area, 0, false);
                            }
                        }
                        //set width
                        area.$percentage = $scope.percentage(area.grid);
                        area.$uniqueId = $scope.setUniqueId();
                    } else {
                        original.areas.splice(areaIndex, 1);
                    }
                });
                //replace the old row
                original.$initialized = true;
                //set a disposable unique ID
                original.$uniqueId = $scope.setUniqueId();
                //set a no disposable unique ID (util for row styling)
                original.id = !row.id ? $scope.setUniqueId() : row.id;
                return original;
            }
        };
        // *********************************************
        // Init control
        // *********************************************
        $scope.initControl = function (control, index) {
            control.$index = index;
            control.$uniqueId = $scope.setUniqueId();
            //error handling in case of missing editor..
            //should only happen if stripped earlier
            if (!control.editor) {
                control.$editorPath = 'views/propertyeditors/grid/editors/error.html';
            }
            if (!control.$editorPath) {
                var editorConfig = $scope.getEditor(control.editor.alias);
                if (editorConfig) {
                    control.editor = editorConfig;
                    //if its an absolute path
                    if (control.editor.view.startsWith('/') || control.editor.view.startsWith('~/')) {
                        control.$editorPath = umbRequestHelper.convertVirtualToAbsolutePath(control.editor.view);
                    } else {
                        //use convention
                        control.$editorPath = 'views/propertyeditors/grid/editors/' + control.editor.view + '.html';
                    }
                } else {
                    control.$editorPath = 'views/propertyeditors/grid/editors/error.html';
                }
            }
        };
        gridService.getGridEditors().then(function (response) {
            $scope.availableEditors = response.data;
            //Localize the grid editor names
            angular.forEach($scope.availableEditors, function (value, key) {
                //If no translation is provided, keep using the editor name from the manifest
                if (localizationService.dictionary.hasOwnProperty('grid_' + value.alias)) {
                    value.name = localizationService.localize('grid_' + value.alias);
                }
            });
            $scope.contentReady = true;
            // *********************************************
            // Init grid
            // *********************************************
            eventsService.emit('grid.initializing', {
                scope: $scope,
                element: $element
            });
            $scope.initContent();
            eventsService.emit('grid.initialized', {
                scope: $scope,
                element: $element
            });
        });
        //Clean the grid value before submitting to the server, we don't need
        // all of that grid configuration in the value to be stored!! All of that
        // needs to be merged in at runtime to ensure that the real config values are used
        // if they are ever updated.
        var unsubscribe = $scope.$on('formSubmitting', function () {
            if ($scope.model.value && $scope.model.value.sections) {
                _.each($scope.model.value.sections, function (section) {
                    if (section.rows) {
                        _.each(section.rows, function (row) {
                            if (row.areas) {
                                _.each(row.areas, function (area) {
                                    //Remove the 'editors' - these are the allowed editors, these will
                                    // be injected at runtime to this editor, it should not be persisted
                                    if (area.editors) {
                                        delete area.editors;
                                    }
                                    if (area.controls) {
                                        _.each(area.controls, function (control) {
                                            if (control.editor) {
                                                //replace
                                                var alias = control.editor.alias;
                                                control.editor = { alias: alias };
                                            }
                                        });
                                    }
                                });
                            }
                        });
                    }
                });
            }
        });
        //when the scope is destroyed we need to unsubscribe
        $scope.$on('$destroy', function () {
            unsubscribe();
        });
    });
    angular.module('umbraco').controller('Umbraco.PropertyEditors.GridPrevalueEditorController', function ($scope, $http, assetsService, $rootScope, dialogService, mediaResource, gridService, imageHelper, $timeout) {
        var emptyModel = {
            styles: [{
                    label: 'Set a background image',
                    description: 'Set a row background',
                    key: 'background-image',
                    view: 'imagepicker',
                    modifier: 'url({0})'
                }],
            config: [{
                    label: 'Class',
                    description: 'Set a css class',
                    key: 'class',
                    view: 'textstring'
                }],
            columns: 12,
            templates: [
                {
                    name: '1 column layout',
                    sections: [{ grid: 12 }]
                },
                {
                    name: '2 column layout',
                    sections: [
                        { grid: 4 },
                        { grid: 8 }
                    ]
                }
            ],
            layouts: [
                {
                    label: 'Headline',
                    name: 'Headline',
                    areas: [{
                            grid: 12,
                            editors: ['headline']
                        }]
                },
                {
                    label: 'Article',
                    name: 'Article',
                    areas: [
                        { grid: 4 },
                        { grid: 8 }
                    ]
                }
            ]
        };
        /****************
            template
        *****************/
        $scope.configureTemplate = function (template) {
            var templatesCopy = angular.copy($scope.model.value.templates);
            if (template === undefined) {
                template = {
                    name: '',
                    sections: []
                };
                $scope.model.value.templates.push(template);
            }
            $scope.layoutConfigOverlay = {};
            $scope.layoutConfigOverlay.view = 'views/propertyEditors/grid/dialogs/layoutconfig.html';
            $scope.layoutConfigOverlay.currentLayout = template;
            $scope.layoutConfigOverlay.rows = $scope.model.value.layouts;
            $scope.layoutConfigOverlay.columns = $scope.model.value.columns;
            $scope.layoutConfigOverlay.show = true;
            $scope.layoutConfigOverlay.submit = function (model) {
                $scope.layoutConfigOverlay.show = false;
                $scope.layoutConfigOverlay = null;
            };
            $scope.layoutConfigOverlay.close = function (oldModel) {
                //reset templates
                $scope.model.value.templates = templatesCopy;
                $scope.layoutConfigOverlay.show = false;
                $scope.layoutConfigOverlay = null;
            };
        };
        $scope.deleteTemplate = function (index) {
            $scope.model.value.templates.splice(index, 1);
        };
        /****************
            Row
        *****************/
        $scope.configureLayout = function (layout) {
            var layoutsCopy = angular.copy($scope.model.value.layouts);
            if (layout === undefined) {
                layout = {
                    name: '',
                    areas: []
                };
                $scope.model.value.layouts.push(layout);
            }
            $scope.rowConfigOverlay = {};
            $scope.rowConfigOverlay.view = 'views/propertyEditors/grid/dialogs/rowconfig.html';
            $scope.rowConfigOverlay.currentRow = layout;
            $scope.rowConfigOverlay.editors = $scope.editors;
            $scope.rowConfigOverlay.columns = $scope.model.value.columns;
            $scope.rowConfigOverlay.show = true;
            $scope.rowConfigOverlay.submit = function (model) {
                $scope.rowConfigOverlay.show = false;
                $scope.rowConfigOverlay = null;
            };
            $scope.rowConfigOverlay.close = function (oldModel) {
                $scope.model.value.layouts = layoutsCopy;
                $scope.rowConfigOverlay.show = false;
                $scope.rowConfigOverlay = null;
            };
        };
        //var rowDeletesPending = false;
        $scope.deleteLayout = function (index) {
            $scope.rowDeleteOverlay = {};
            $scope.rowDeleteOverlay.view = 'views/propertyEditors/grid/dialogs/rowdeleteconfirm.html';
            $scope.rowDeleteOverlay.dialogData = { rowName: $scope.model.value.layouts[index].name };
            $scope.rowDeleteOverlay.show = true;
            $scope.rowDeleteOverlay.submit = function (model) {
                $scope.model.value.layouts.splice(index, 1);
                $scope.rowDeleteOverlay.show = false;
                $scope.rowDeleteOverlay = null;
            };
            $scope.rowDeleteOverlay.close = function (oldModel) {
                $scope.rowDeleteOverlay.show = false;
                $scope.rowDeleteOverlay = null;
            };
        };
        /****************
            utillities
        *****************/
        $scope.toggleCollection = function (collection, toggle) {
            if (toggle) {
                collection = [];
            } else {
                delete collection;
            }
        };
        $scope.percentage = function (spans) {
            return (spans / $scope.model.value.columns * 100).toFixed(8);
        };
        $scope.zeroWidthFilter = function (cell) {
            return cell.grid > 0;
        };
        /****************
            Config
        *****************/
        $scope.removeConfigValue = function (collection, index) {
            collection.splice(index, 1);
        };
        var editConfigCollection = function (configValues, title, callback) {
            $scope.editConfigCollectionOverlay = {};
            $scope.editConfigCollectionOverlay.view = 'views/propertyeditors/grid/dialogs/editconfig.html';
            $scope.editConfigCollectionOverlay.config = configValues;
            $scope.editConfigCollectionOverlay.title = title;
            $scope.editConfigCollectionOverlay.show = true;
            $scope.editConfigCollectionOverlay.submit = function (model) {
                callback(model.config);
                $scope.editConfigCollectionOverlay.show = false;
                $scope.editConfigCollectionOverlay = null;
            };
            $scope.editConfigCollectionOverlay.close = function (oldModel) {
                $scope.editConfigCollectionOverlay.show = false;
                $scope.editConfigCollectionOverlay = null;
            };
        };
        $scope.editConfig = function () {
            editConfigCollection($scope.model.value.config, 'Settings', function (data) {
                $scope.model.value.config = data;
            });
        };
        $scope.editStyles = function () {
            editConfigCollection($scope.model.value.styles, 'Styling', function (data) {
                $scope.model.value.styles = data;
            });
        };
        /****************
            editors
        *****************/
        gridService.getGridEditors().then(function (response) {
            $scope.editors = response.data;
        });
        /* init grid data */
        if (!$scope.model.value || $scope.model.value === '' || !$scope.model.value.templates) {
            $scope.model.value = emptyModel;
        } else {
            if (!$scope.model.value.columns) {
                $scope.model.value.columns = emptyModel.columns;
            }
            if (!$scope.model.value.config) {
                $scope.model.value.config = [];
            }
            if (!$scope.model.value.styles) {
                $scope.model.value.styles = [];
            }
        }
        /****************
            Clean up
        *****************/
        var unsubscribe = $scope.$on('formSubmitting', function (ev, args) {
            var ts = $scope.model.value.templates;
            var ls = $scope.model.value.layouts;
            _.each(ts, function (t) {
                _.each(t.sections, function (section, index) {
                    if (section.grid === 0) {
                        t.sections.splice(index, 1);
                    }
                });
            });
            _.each(ls, function (l) {
                _.each(l.areas, function (area, index) {
                    if (area.grid === 0) {
                        l.areas.splice(index, 1);
                    }
                });
            });
        });
        //when the scope is destroyed we need to unsubscribe
        $scope.$on('$destroy', function () {
            unsubscribe();
        });
    });
    /**
 * @ngdoc controller
 * @name Umbraco.Editors.IdWithGuidValueController
 * @function
 * 
 * @description
 * The controller for the idwithguid property editor, which formats the ID as normal
 * with the GUID in smaller text below, as used across the backoffice.
*/
    function IdWithGuidValueController($rootScope, $scope, $filter) {
        function formatDisplayValue() {
            if ($scope.model.value.length > 1) {
                $scope.displayid = $scope.model.value[0];
                $scope.displayguid = $scope.model.value[1];
            } else {
                $scope.displayid = $scope.model.value;
            }
        }
        //format the display value on init:
        formatDisplayValue();
    }
    angular.module('umbraco').controller('Umbraco.PropertyEditors.IdWithGuidValueController', IdWithGuidValueController);
    //this controller simply tells the dialogs service to open a mediaPicker window
    //with a specified callback, this callback will receive an object with a selection on it
    angular.module('umbraco').controller('Umbraco.PropertyEditors.ImageCropperController', function ($rootScope, $routeParams, $scope, $log, mediaHelper, cropperHelper, $timeout, editorState, umbRequestHelper, fileManager, angularHelper) {
        var config = angular.copy($scope.model.config);
        $scope.imageIsLoaded = false;
        //move previously saved value to the editor
        if ($scope.model.value) {
            //backwards compat with the old file upload (incase some-one swaps them..)
            if (angular.isString($scope.model.value)) {
                config.src = $scope.model.value;
                $scope.model.value = config;
            } else if ($scope.model.value.crops) {
                //sync any config changes with the editor and drop outdated crops
                _.each($scope.model.value.crops, function (saved) {
                    var configured = _.find(config.crops, function (item) {
                        return item.alias === saved.alias;
                    });
                    if (configured && configured.height === saved.height && configured.width === saved.width) {
                        configured.coordinates = saved.coordinates;
                    }
                });
                $scope.model.value.crops = config.crops;
                //restore focalpoint if missing
                if (!$scope.model.value.focalPoint) {
                    $scope.model.value.focalPoint = {
                        left: 0.5,
                        top: 0.5
                    };
                }
            }
            $scope.imageSrc = $scope.model.value.src;
        }
        //crop a specific crop
        $scope.crop = function (crop) {
            // clone the crop so we can discard the changes
            $scope.currentCrop = angular.copy(crop);
            $scope.currentPoint = undefined;
        };
        //done cropping
        $scope.done = function () {
            if (!$scope.currentCrop) {
                return;
            }
            // find the original crop by crop alias and update its coordinates
            var editedCrop = _.find($scope.model.value.crops, function (crop) {
                return crop.alias === $scope.currentCrop.alias;
            });
            editedCrop.coordinates = $scope.currentCrop.coordinates;
            $scope.close();
            angularHelper.getCurrentForm($scope).$setDirty();
        };
        //reset the current crop
        $scope.reset = function () {
            $scope.currentCrop.coordinates = undefined;
            $scope.done();
        };
        //close crop overlay
        $scope.close = function (crop) {
            $scope.currentCrop = undefined;
            $scope.currentPoint = undefined;
        };
        //crop a specific crop
        $scope.clear = function (crop) {
            //clear current uploaded files
            fileManager.setFiles($scope.model.alias, []);
            //clear the ui
            $scope.imageSrc = undefined;
            if ($scope.model.value) {
                delete $scope.model.value;
            }
            // set form to dirty to tricker discard changes dialog
            var currForm = angularHelper.getCurrentForm($scope);
            currForm.$setDirty();
        };
        //show previews
        $scope.togglePreviews = function () {
            if ($scope.showPreviews) {
                $scope.showPreviews = false;
                $scope.tempShowPreviews = false;
            } else {
                $scope.showPreviews = true;
            }
        };
        $scope.imageLoaded = function (isCroppable, hasDimensions) {
            $scope.imageIsLoaded = true;
            $scope.isCroppable = isCroppable;
            $scope.hasDimensions = hasDimensions;
        };
        $scope.focalPointChanged = function () {
            angularHelper.getCurrentForm($scope).$setDirty();
        };
        //on image selected, update the cropper
        $scope.$on('filesSelected', function (ev, args) {
            $scope.model.value = config;
            if (args.files && args.files[0]) {
                fileManager.setFiles($scope.model.alias, args.files);
                var reader = new FileReader();
                reader.onload = function (e) {
                    $scope.$apply(function () {
                        $scope.imageSrc = e.target.result;
                    });
                };
                reader.readAsDataURL(args.files[0]);
            }
        });
        //here we declare a special method which will be called whenever the value has changed from the server
        $scope.model.onValueChanged = function (newVal, oldVal) {
            //clear current uploaded files
            fileManager.setFiles($scope.model.alias, []);
        };
        var unsubscribe = $scope.$on('formSubmitting', function () {
            $scope.done();
        });
        $scope.$on('$destroy', function () {
            unsubscribe();
        });
    }).run(function (mediaHelper, umbRequestHelper) {
        if (mediaHelper && mediaHelper.registerFileResolver) {
            //NOTE: The 'entity' can be either a normal media entity or an "entity" returned from the entityResource
            // they contain different data structures so if we need to query against it we need to be aware of this.
            mediaHelper.registerFileResolver('Umbraco.ImageCropper', function (property, entity, thumbnail) {
                if (property.value && property.value.src) {
                    if (thumbnail === true) {
                        return property.value.src + '?width=500&mode=max&animationprocessmode=first';
                    } else {
                        return property.value.src;
                    }    //this is a fallback in case the cropper has been asssigned a upload field
                } else if (angular.isString(property.value)) {
                    if (thumbnail) {
                        if (mediaHelper.detectIfImageByExtension(property.value)) {
                            var thumbnailUrl = umbRequestHelper.getApiUrl('imagesApiBaseUrl', 'GetBigThumbnail', [{ originalImagePath: property.value }]);
                            return thumbnailUrl;
                        } else {
                            return null;
                        }
                    } else {
                        return property.value;
                    }
                }
                return null;
            });
        }
    });
    angular.module('umbraco').controller('Umbraco.PrevalueEditors.CropSizesController', function ($scope) {
        if (!$scope.model.value) {
            $scope.model.value = [];
        }
        $scope.editMode = false;
        $scope.setFocus = false;
        $scope.remove = function (item, evt) {
            evt.preventDefault();
            $scope.model.value = _.reject($scope.model.value, function (x) {
                return x.alias === item.alias;
            });
        };
        $scope.edit = function (item, evt) {
            evt.preventDefault();
            $scope.editMode = true;
            $scope.setFocus = false;
            $scope.newItem = item;
        };
        $scope.cancel = function (evt) {
            evt.preventDefault();
            $scope.editMode = false;
            $scope.setFocus = true;
            $scope.newItem = null;
        };
        $scope.change = function () {
            // Listen to the change event and set focus 2 false
            if ($scope.setFocus) {
                $scope.setFocus = false;
                return;
            }
        };
        $scope.add = function (evt) {
            evt.preventDefault();
            $scope.editMode = false;
            $scope.setFocus = true;
            if ($scope.newItem && $scope.newItem.alias && angular.isNumber($scope.newItem.width) && angular.isNumber($scope.newItem.height) && $scope.newItem.width > 0 && $scope.newItem.height > 0) {
                var exists = _.find($scope.model.value, function (item) {
                    return $scope.newItem.alias === item.alias;
                });
                if (!exists) {
                    $scope.model.value.push($scope.newItem);
                    $scope.newItem = {};
                    $scope.hasError = false;
                    $scope.cropAdded = false;
                    return;
                } else {
                    $scope.newItem = null;
                    $scope.hasError = false;
                    return;
                }
            }
            //there was an error, do the highlight (will be set back by the directive)
            $scope.hasError = true;
        };
        $scope.sortableOptions = { axis: 'y' };
    });
    function includePropsPreValsController($rootScope, $scope, localizationService, contentTypeResource) {
        if (!$scope.model.value) {
            $scope.model.value = [];
        }
        $scope.hasError = false;
        $scope.errorMsg = '';
        $scope.propertyAliases = [];
        $scope.selectedField = null;
        $scope.systemFields = [
            { value: 'sortOrder' },
            { value: 'updateDate' },
            { value: 'updater' },
            { value: 'createDate' },
            { value: 'owner' },
            { value: 'published' },
            { value: 'contentTypeAlias' },
            { value: 'email' },
            { value: 'username' }
        ];
        $scope.getLocalizedKey = function (alias) {
            switch (alias) {
            case 'name':
                return 'general_name';
            case 'sortOrder':
                return 'general_sort';
            case 'updateDate':
                return 'content_updateDate';
            case 'updater':
                return 'content_updatedBy';
            case 'createDate':
                return 'content_createDate';
            case 'owner':
                return 'content_createBy';
            case 'published':
                return 'content_isPublished';
            case 'contentTypeAlias':
                //NOTE: This will just be 'Document' type even if it's for media/members since this is just a pre-val editor and we don't have a key for 'Content Type Alias'
                return 'content_documentType';
            case 'email':
                return 'general_email';
            case 'username':
                return 'general_username';
            }
            return alias;
        };
        $scope.changeField = function () {
            $scope.hasError = false;
            $scope.errorMsg = '';
        };
        $scope.removeField = function (e) {
            $scope.model.value = _.reject($scope.model.value, function (x) {
                return x.alias === e.alias;
            });
        };
        //now we'll localize these strings, for some reason the directive doesn't work inside of the select group with an ng-model declared
        _.each($scope.systemFields, function (e, i) {
            var key = $scope.getLocalizedKey(e.value);
            localizationService.localize(key).then(function (v) {
                e.name = v;
                switch (e.value) {
                case 'updater':
                    e.name += ' (Content only)';
                    break;
                case 'published':
                    e.name += ' (Content only)';
                    break;
                case 'email':
                    e.name += ' (Members only)';
                    break;
                case 'username':
                    e.name += ' (Members only)';
                    break;
                }
            });
        });
        // Return a helper with preserved width of cells
        var fixHelper = function (e, ui) {
            ui.children().each(function () {
                $(this).width($(this).width());
            });
            var row = ui.clone();
            row.css('background-color', 'lightgray');
            return row;
        };
        $scope.sortableOptions = {
            helper: fixHelper,
            handle: '.handle',
            opacity: 0.5,
            axis: 'y',
            containment: 'parent',
            cursor: 'move',
            items: '> tr',
            tolerance: 'pointer',
            forcePlaceholderSize: true,
            start: function (e, ui) {
                ui.placeholder.height(ui.item.height());
            },
            update: function (e, ui) {
                // Get the new and old index for the moved element (using the text as the identifier)
                var newIndex = ui.item.index();
                var movedAlias = $('.alias-value', ui.item).text().trim();
                var originalIndex = getAliasIndexByText(movedAlias);
                // Move the element in the model
                if (originalIndex > -1) {
                    var movedElement = $scope.model.value[originalIndex];
                    $scope.model.value.splice(originalIndex, 1);
                    $scope.model.value.splice(newIndex, 0, movedElement);
                }
            }
        };
        contentTypeResource.getAllPropertyTypeAliases().then(function (data) {
            $scope.propertyAliases = data;
        });
        $scope.addField = function () {
            var val = $scope.selectedField;
            if (val) {
                var isSystem = val.startsWith('_system_');
                if (isSystem) {
                    val = val.trimStart('_system_');
                }
                var exists = _.find($scope.model.value, function (i) {
                    return i.alias === val;
                });
                if (!exists) {
                    $scope.hasError = false;
                    $scope.errorMsg = '';
                    $scope.model.value.push({
                        alias: val,
                        isSystem: isSystem ? 1 : 0
                    });
                } else {
                    //there was an error, do the highlight (will be set back by the directive)
                    $scope.hasError = true;
                    $scope.errorMsg = 'Property is already added';
                }
            } else {
                $scope.hasError = true;
                $scope.errorMsg = 'No property selected';
            }
        };
        function getAliasIndexByText(value) {
            for (var i = 0; i < $scope.model.value.length; i++) {
                if ($scope.model.value[i].alias === value) {
                    return i;
                }
            }
            return -1;
        }
    }
    angular.module('umbraco').controller('Umbraco.PrevalueEditors.IncludePropertiesListViewController', includePropsPreValsController);
    /**
 * @ngdoc controller
 * @name Umbraco.PrevalueEditors.ListViewLayoutsPreValsController
 * @function
 *
 * @description
 * The controller for configuring layouts for list views
 */
    (function () {
        'use strict';
        function ListViewLayoutsPreValsController($scope) {
            var vm = this;
            vm.focusLayoutName = false;
            vm.layoutsSortableOptions = {
                distance: 10,
                tolerance: 'pointer',
                opacity: 0.7,
                scroll: true,
                cursor: 'move',
                handle: '.list-view-layout__sort-handle'
            };
            vm.addLayout = addLayout;
            vm.showPrompt = showPrompt;
            vm.hidePrompt = hidePrompt;
            vm.removeLayout = removeLayout;
            vm.openIconPicker = openIconPicker;
            function activate() {
            }
            function addLayout() {
                vm.focusLayoutName = false;
                var layout = {
                    'name': '',
                    'path': '',
                    'icon': 'icon-stop',
                    'selected': true
                };
                $scope.model.value.push(layout);
            }
            function showPrompt(layout) {
                layout.deletePrompt = true;
            }
            function hidePrompt(layout) {
                layout.deletePrompt = false;
            }
            function removeLayout($index, layout) {
                $scope.model.value.splice($index, 1);
            }
            function openIconPicker(layout) {
                vm.iconPickerDialog = {
                    view: 'iconpicker',
                    show: true,
                    submit: function (model) {
                        if (model.color) {
                            layout.icon = model.icon + ' ' + model.color;
                        } else {
                            layout.icon = model.icon;
                        }
                        vm.focusLayoutName = true;
                        vm.iconPickerDialog.show = false;
                        vm.iconPickerDialog = null;
                    }
                };
            }
            activate();
        }
        angular.module('umbraco').controller('Umbraco.PrevalueEditors.ListViewLayoutsPreValsController', ListViewLayoutsPreValsController);
    }());
    /**
 * @ngdoc controller
 * @name Umbraco.Editors.DocumentType.EditController
 * @function
 *
 * @description
 * The controller for the content type editor
 */
    (function () {
        'use strict';
        function ListViewGridLayoutController($scope, $routeParams, mediaHelper, mediaResource, $location, listViewHelper, mediaTypeHelper) {
            var vm = this;
            var umbracoSettings = Umbraco.Sys.ServerVariables.umbracoSettings;
            vm.nodeId = $scope.contentId;
            // Use whitelist of allowed file types if provided
            vm.acceptedFileTypes = mediaHelper.formatFileTypes(umbracoSettings.allowedUploadFiles);
            if (vm.acceptedFileTypes === '') {
                // If not provided, we pass in a blacklist by adding ! to the file extensions, allowing everything EXCEPT for disallowedUploadFiles
                vm.acceptedFileTypes = !mediaHelper.formatFileTypes(umbracoSettings.disallowedUploadFiles);
            }
            vm.maxFileSize = umbracoSettings.maxFileSize + 'KB';
            vm.activeDrag = false;
            vm.mediaDetailsTooltip = {};
            vm.itemsWithoutFolders = [];
            vm.isRecycleBin = $scope.contentId === '-21' || $scope.contentId === '-20';
            vm.acceptedMediatypes = [];
            vm.dragEnter = dragEnter;
            vm.dragLeave = dragLeave;
            vm.onFilesQueue = onFilesQueue;
            vm.onUploadComplete = onUploadComplete;
            vm.hoverMediaItemDetails = hoverMediaItemDetails;
            vm.selectContentItem = selectContentItem;
            vm.selectItem = selectItem;
            vm.selectFolder = selectFolder;
            vm.goToItem = goToItem;
            function activate() {
                vm.itemsWithoutFolders = filterOutFolders($scope.items);
                //no need to make another REST/DB call if this data is not used when we are browsing the bin
                if ($scope.entityType === 'media' && !vm.isRecycleBin) {
                    mediaTypeHelper.getAllowedImagetypes(vm.nodeId).then(function (types) {
                        vm.acceptedMediatypes = types;
                    });
                }
            }
            function filterOutFolders(items) {
                var newArray = [];
                if (items && items.length) {
                    for (var i = 0; items.length > i; i++) {
                        var item = items[i];
                        var isFolder = !mediaHelper.hasFilePropertyType(item);
                        if (!isFolder) {
                            newArray.push(item);
                        }
                    }
                }
                return newArray;
            }
            function dragEnter(el, event) {
                vm.activeDrag = true;
            }
            function dragLeave(el, event) {
                vm.activeDrag = false;
            }
            function onFilesQueue() {
                vm.activeDrag = false;
            }
            function onUploadComplete() {
                $scope.getContent($scope.contentId);
            }
            function hoverMediaItemDetails(item, event, hover) {
                if (hover && !vm.mediaDetailsTooltip.show) {
                    vm.mediaDetailsTooltip.event = event;
                    vm.mediaDetailsTooltip.item = item;
                    vm.mediaDetailsTooltip.show = true;
                } else if (!hover && vm.mediaDetailsTooltip.show) {
                    vm.mediaDetailsTooltip.show = false;
                }
            }
            function selectContentItem(item, $event, $index) {
                listViewHelper.selectHandler(item, $index, $scope.items, $scope.selection, $event);
            }
            function selectItem(item, $event, $index) {
                listViewHelper.selectHandler(item, $index, vm.itemsWithoutFolders, $scope.selection, $event);
            }
            function selectFolder(folder, $event, $index) {
                listViewHelper.selectHandler(folder, $index, $scope.folders, $scope.selection, $event);
            }
            function goToItem(item, $event, $index) {
                $location.path($scope.entityType + '/' + $scope.entityType + '/edit/' + item.id);
            }
            activate();
        }
        angular.module('umbraco').controller('Umbraco.PropertyEditors.ListView.GridLayoutController', ListViewGridLayoutController);
    }());
    (function () {
        'use strict';
        function ListViewListLayoutController($scope, listViewHelper, $location, mediaHelper, mediaTypeHelper) {
            var vm = this;
            var umbracoSettings = Umbraco.Sys.ServerVariables.umbracoSettings;
            vm.nodeId = $scope.contentId;
            // Use whitelist of allowed file types if provided
            vm.acceptedFileTypes = mediaHelper.formatFileTypes(umbracoSettings.allowedUploadFiles);
            if (vm.acceptedFileTypes === '') {
                // If not provided, we pass in a blacklist by adding ! to the file extensions, allowing everything EXCEPT for disallowedUploadFiles
                vm.acceptedFileTypes = !mediaHelper.formatFileTypes(umbracoSettings.disallowedUploadFiles);
            }
            vm.maxFileSize = umbracoSettings.maxFileSize + 'KB';
            vm.activeDrag = false;
            vm.isRecycleBin = $scope.contentId === '-21' || $scope.contentId === '-20';
            vm.acceptedMediatypes = [];
            vm.selectItem = selectItem;
            vm.clickItem = clickItem;
            vm.selectAll = selectAll;
            vm.isSelectedAll = isSelectedAll;
            vm.isSortDirection = isSortDirection;
            vm.sort = sort;
            vm.dragEnter = dragEnter;
            vm.dragLeave = dragLeave;
            vm.onFilesQueue = onFilesQueue;
            vm.onUploadComplete = onUploadComplete;
            markAsSensitive();
            function activate() {
                if ($scope.entityType === 'media') {
                    mediaTypeHelper.getAllowedImagetypes(vm.nodeId).then(function (types) {
                        vm.acceptedMediatypes = types;
                    });
                }
            }
            function selectAll($event) {
                listViewHelper.selectAllItems($scope.items, $scope.selection, $event);
            }
            function isSelectedAll() {
                return listViewHelper.isSelectedAll($scope.items, $scope.selection);
            }
            function selectItem(selectedItem, $index, $event) {
                listViewHelper.selectHandler(selectedItem, $index, $scope.items, $scope.selection, $event);
            }
            function clickItem(item) {
                // if item.id is 2147483647 (int.MaxValue) use item.key
                $location.path($scope.entityType + '/' + $scope.entityType + '/edit/' + (item.id === 2147483647 ? item.key : item.id));
            }
            function isSortDirection(col, direction) {
                return listViewHelper.setSortingDirection(col, direction, $scope.options);
            }
            function sort(field, allow, isSystem) {
                if (allow) {
                    $scope.options.orderBySystemField = isSystem;
                    listViewHelper.setSorting(field, allow, $scope.options);
                    $scope.getContent($scope.contentId);
                }
            }
            // Dropzone upload functions
            function dragEnter(el, event) {
                vm.activeDrag = true;
            }
            function dragLeave(el, event) {
                vm.activeDrag = false;
            }
            function onFilesQueue() {
                vm.activeDrag = false;
            }
            function onUploadComplete() {
                $scope.getContent($scope.contentId);
            }
            function markAsSensitive() {
                angular.forEach($scope.options.includeProperties, function (option) {
                    option.isSensitive = false;
                    angular.forEach($scope.items, function (item) {
                        angular.forEach(item.properties, function (property) {
                            if (option.alias === property.alias) {
                                option.isSensitive = property.isSensitive;
                            }
                        });
                    });
                });
            }
            activate();
        }
        angular.module('umbraco').controller('Umbraco.PropertyEditors.ListView.ListLayoutController', ListViewListLayoutController);
    }());
    function listViewController($rootScope, $scope, $routeParams, $injector, $cookieStore, notificationsService, iconHelper, dialogService, editorState, localizationService, $location, appState, $timeout, $q, mediaResource, listViewHelper, userService, navigationService, treeService, mediaHelper) {
        //this is a quick check to see if we're in create mode, if so just exit - we cannot show children for content
        // that isn't created yet, if we continue this will use the parent id in the route params which isn't what
        // we want. NOTE: This is just a safety check since when we scaffold an empty model on the server we remove
        // the list view tab entirely when it's new.
        if ($routeParams.create) {
            $scope.isNew = true;
            return;
        }
        //Now we need to check if this is for media, members or content because that will depend on the resources we use
        var contentResource, getContentTypesCallback, getListResultsCallback, deleteItemCallback, getIdCallback, createEditUrlCallback;
        //check the config for the entity type, or the current section name (since the config is only set in c#, not in pre-vals)
        if ($scope.model.config.entityType && $scope.model.config.entityType === 'member' || appState.getSectionState('currentSection') === 'member') {
            $scope.entityType = 'member';
            contentResource = $injector.get('memberResource');
            getContentTypesCallback = $injector.get('memberTypeResource').getTypes;
            getListResultsCallback = contentResource.getPagedResults;
            deleteItemCallback = contentResource.deleteByKey;
            getIdCallback = function (selected) {
                return selected.key;
            };
            createEditUrlCallback = function (item) {
                return '/' + $scope.entityType + '/' + $scope.entityType + '/edit/' + item.key + '?page=' + $scope.options.pageNumber + '&listName=' + $scope.contentId;
            };
        } else {
            //check the config for the entity type, or the current section name (since the config is only set in c#, not in pre-vals)
            if ($scope.model.config.entityType && $scope.model.config.entityType === 'media' || appState.getSectionState('currentSection') === 'media') {
                $scope.entityType = 'media';
                contentResource = $injector.get('mediaResource');
                getContentTypesCallback = $injector.get('mediaTypeResource').getAllowedTypes;
            } else {
                $scope.entityType = 'content';
                contentResource = $injector.get('contentResource');
                getContentTypesCallback = $injector.get('contentTypeResource').getAllowedTypes;
            }
            getListResultsCallback = contentResource.getChildren;
            deleteItemCallback = contentResource.deleteById;
            getIdCallback = function (selected) {
                return selected.id;
            };
            createEditUrlCallback = function (item) {
                return '/' + $scope.entityType + '/' + $scope.entityType + '/edit/' + item.id + '?page=' + $scope.options.pageNumber;
            };
        }
        $scope.pagination = [];
        $scope.isNew = false;
        $scope.actionInProgress = false;
        $scope.selection = [];
        $scope.folders = [];
        $scope.listViewResultSet = {
            totalPages: 0,
            items: []
        };
        $scope.createAllowedButtonSingle = false;
        $scope.createAllowedButtonSingleWithBlueprints = false;
        $scope.createAllowedButtonMultiWithBlueprints = false;
        //when this is null, we don't check permissions
        $scope.currentNodePermissions = null;
        if ($scope.entityType === 'content') {
            //Just ensure we do have an editorState
            if (editorState.current) {
                //Fetch current node allowed actions for the current user
                //This is the current node & not each individual child node in the list
                var currentUserPermissions = editorState.current.allowedActions;
                //Create a nicer model rather than the funky & hard to remember permissions strings
                $scope.currentNodePermissions = {
                    'canCopy': _.contains(currentUserPermissions, 'O'),
                    //Magic Char = O
                    'canCreate': _.contains(currentUserPermissions, 'C'),
                    //Magic Char = C
                    'canDelete': _.contains(currentUserPermissions, 'D'),
                    //Magic Char = D
                    'canMove': _.contains(currentUserPermissions, 'M'),
                    //Magic Char = M                
                    'canPublish': _.contains(currentUserPermissions, 'U'),
                    //Magic Char = U
                    'canUnpublish': _.contains(currentUserPermissions, 'U')    //Magic Char = Z (however UI says it can't be set, so if we can publish 'U' we can unpublish)
                };
            }
        }
        //when this is null, we don't check permissions
        $scope.buttonPermissions = null;
        //When we are dealing with 'content', we need to deal with permissions on child nodes.
        // Currently there is no real good way to 
        if ($scope.entityType === 'content') {
            var idsWithPermissions = null;
            $scope.buttonPermissions = {
                canCopy: true,
                canCreate: true,
                canDelete: true,
                canMove: true,
                canPublish: true,
                canUnpublish: true
            };
            $scope.$watch(function () {
                return $scope.selection.length;
            }, function (newVal, oldVal) {
                if (idsWithPermissions == null && newVal > 0 || idsWithPermissions != null) {
                    //get all of the selected ids
                    var ids = _.map($scope.selection, function (i) {
                        return i.id.toString();
                    });
                    //remove the dictionary items that don't have matching ids
                    var filtered = {};
                    _.each(idsWithPermissions, function (value, key, list) {
                        if (_.contains(ids, key)) {
                            filtered[key] = value;
                        }
                    });
                    idsWithPermissions = filtered;
                    //find all ids that we haven't looked up permissions for
                    var existingIds = _.keys(idsWithPermissions);
                    var missingLookup = _.map(_.difference(ids, existingIds), function (i) {
                        return Number(i);
                    });
                    if (missingLookup.length > 0) {
                        contentResource.getPermissions(missingLookup).then(function (p) {
                            $scope.buttonPermissions = listViewHelper.getButtonPermissions(p, idsWithPermissions);
                        });
                    } else {
                        $scope.buttonPermissions = listViewHelper.getButtonPermissions({}, idsWithPermissions);
                    }
                }
            });
        }
        $scope.options = {
            displayAtTabNumber: $scope.model.config.displayAtTabNumber ? $scope.model.config.displayAtTabNumber : 1,
            pageSize: $scope.model.config.pageSize ? $scope.model.config.pageSize : 10,
            pageNumber: $routeParams.page && Number($routeParams.page) != NaN && Number($routeParams.page) > 0 ? $routeParams.page : 1,
            filter: '',
            orderBy: ($scope.model.config.orderBy ? $scope.model.config.orderBy : 'VersionDate').trim(),
            orderDirection: $scope.model.config.orderDirection ? $scope.model.config.orderDirection.trim() : 'desc',
            orderBySystemField: true,
            includeProperties: $scope.model.config.includeProperties ? $scope.model.config.includeProperties : [
                {
                    alias: 'updateDate',
                    header: 'Last edited',
                    isSystem: 1
                },
                {
                    alias: 'updater',
                    header: 'Last edited by',
                    isSystem: 1
                }
            ],
            layout: {
                layouts: $scope.model.config.layouts,
                activeLayout: listViewHelper.getLayout($routeParams.id, $scope.model.config.layouts)
            },
            allowBulkPublish: $scope.entityType === 'content' && $scope.model.config.bulkActionPermissions.allowBulkPublish,
            allowBulkUnpublish: $scope.entityType === 'content' && $scope.model.config.bulkActionPermissions.allowBulkUnpublish,
            allowBulkCopy: $scope.entityType === 'content' && $scope.model.config.bulkActionPermissions.allowBulkCopy,
            allowBulkMove: $scope.model.config.bulkActionPermissions.allowBulkMove,
            allowBulkDelete: $scope.model.config.bulkActionPermissions.allowBulkDelete
        };
        // Check if selected order by field is actually custom field
        for (var j = 0; j < $scope.options.includeProperties.length; j++) {
            var includedProperty = $scope.options.includeProperties[j];
            if (includedProperty.alias.toLowerCase() === $scope.options.orderBy.toLowerCase()) {
                $scope.options.orderBySystemField = includedProperty.isSystem === 1;
                break;
            }
        }
        //update all of the system includeProperties to enable sorting
        _.each($scope.options.includeProperties, function (e, i) {
            //NOTE: special case for contentTypeAlias, it's a system property that cannot be sorted
            // to do that, we'd need to update the base query for content to include the content type alias column
            // which requires another join and would be slower. BUT We are doing this for members so not sure it makes a diff?
            if (e.alias != 'contentTypeAlias') {
                e.allowSorting = true;
            }
            // Another special case for members, only fields on the base table (cmsMember) can be used for sorting
            if (e.isSystem && $scope.entityType == 'member') {
                e.allowSorting = e.alias == 'username' || e.alias == 'email';
            }
            if (e.isSystem) {
                //localize the header
                var key = getLocalizedKey(e.alias);
                localizationService.localize(key).then(function (v) {
                    e.header = v;
                });
            }
        });
        $scope.selectLayout = function (selectedLayout) {
            $scope.options.layout.activeLayout = listViewHelper.setLayout($routeParams.id, selectedLayout, $scope.model.config.layouts);
        };
        function showNotificationsAndReset(err, reload, successMsg) {
            //check if response is ysod
            if (err.status && err.status >= 500) {
                // Open ysod overlay
                $scope.ysodOverlay = {
                    view: 'ysod',
                    error: err,
                    show: true
                };
            }
            $timeout(function () {
                $scope.bulkStatus = '';
                $scope.actionInProgress = false;
            }, 500);
            if (err.data && angular.isArray(err.data.notifications)) {
                for (var i = 0; i < err.data.notifications.length; i++) {
                    notificationsService.showNotification(err.data.notifications[i]);
                }
            } else if (successMsg) {
                localizationService.localize('bulk_done').then(function (v) {
                    notificationsService.success(v, successMsg);
                });
            }
        }
        $scope.next = function (pageNumber) {
            $scope.options.pageNumber = pageNumber;
            $scope.reloadView($scope.contentId);
        };
        $scope.goToPage = function (pageNumber) {
            $scope.options.pageNumber = pageNumber;
            $scope.reloadView($scope.contentId);
        };
        $scope.prev = function (pageNumber) {
            $scope.options.pageNumber = pageNumber;
            $scope.reloadView($scope.contentId);
        };
        /*Loads the search results, based on parameters set in prev,next,sort and so on*/
        /*Pagination is done by an array of objects, due angularJS's funky way of monitoring state
   with simple values */
        $scope.getContent = function () {
            $scope.reloadView($scope.contentId);
        };
        $scope.reloadView = function (id) {
            $scope.viewLoaded = false;
            $scope.folders = [];
            listViewHelper.clearSelection($scope.listViewResultSet.items, $scope.folders, $scope.selection);
            getListResultsCallback(id, $scope.options).then(function (data) {
                $scope.actionInProgress = false;
                $scope.listViewResultSet = data;
                //update all values for display
                var section = appState.getSectionState('currentSection');
                if ($scope.listViewResultSet.items) {
                    _.each($scope.listViewResultSet.items, function (e, index) {
                        setPropertyValues(e);
                        // create the folders collection (only for media list views)
                        if (section === 'media' && !mediaHelper.hasFilePropertyType(e)) {
                            $scope.folders.push(e);
                        }
                    });
                }
                $scope.viewLoaded = true;
                //NOTE: This might occur if we are requesting a higher page number than what is actually available, for example
                // if you have more than one page and you delete all items on the last page. In this case, we need to reset to the last
                // available page and then re-load again
                if ($scope.options.pageNumber > $scope.listViewResultSet.totalPages) {
                    $scope.options.pageNumber = $scope.listViewResultSet.totalPages;
                    //reload!
                    $scope.reloadView(id);
                }
            });
        };
        var searchListView = _.debounce(function () {
            $scope.$apply(function () {
                makeSearch();
            });
        }, 500);
        $scope.forceSearch = function (ev) {
            //13: enter
            switch (ev.keyCode) {
            case 13:
                makeSearch();
                break;
            }
        };
        $scope.enterSearch = function () {
            $scope.viewLoaded = false;
            searchListView();
        };
        function makeSearch() {
            if ($scope.options.filter !== null && $scope.options.filter !== undefined) {
                $scope.options.pageNumber = 1;
                $scope.reloadView($scope.contentId);
            }
        }
        $scope.isAnythingSelected = function () {
            if ($scope.selection.length === 0) {
                return false;
            } else {
                return true;
            }
        };
        $scope.selectedItemsCount = function () {
            return $scope.selection.length;
        };
        $scope.clearSelection = function () {
            listViewHelper.clearSelection($scope.listViewResultSet.items, $scope.folders, $scope.selection);
        };
        $scope.getIcon = function (entry) {
            return iconHelper.convertFromLegacyIcon(entry.icon);
        };
        function serial(selected, fn, getStatusMsg, index) {
            return fn(selected, index).then(function (content) {
                index++;
                $scope.bulkStatus = getStatusMsg(index, selected.length);
                return index < selected.length ? serial(selected, fn, getStatusMsg, index) : content;
            }, function (err) {
                var reload = index > 0;
                showNotificationsAndReset(err, reload);
                return err;
            });
        }
        function applySelected(fn, getStatusMsg, getSuccessMsg, confirmMsg) {
            var selected = $scope.selection;
            if (selected.length === 0)
                return;
            if (confirmMsg && !confirm(confirmMsg))
                return;
            $scope.actionInProgress = true;
            $scope.bulkStatus = getStatusMsg(0, selected.length);
            return serial(selected, fn, getStatusMsg, 0).then(function (result) {
                // executes once the whole selection has been processed
                // in case of an error (caught by serial), result will be the error
                if (!(result.data && angular.isArray(result.data.notifications)))
                    showNotificationsAndReset(result, true, getSuccessMsg(selected.length));
            });
        }
        $scope.delete = function () {
            var confirmDeleteText = '';
            localizationService.localize('defaultdialogs_confirmdelete').then(function (value) {
                confirmDeleteText = value;
                var attempt = applySelected(function (selected, index) {
                    return deleteItemCallback(getIdCallback(selected[index]));
                }, function (count, total) {
                    var key = total === 1 ? 'bulk_deletedItemOfItem' : 'bulk_deletedItemOfItems';
                    return localizationService.localize(key, [
                        count,
                        total
                    ]);
                }, function (total) {
                    var key = total === 1 ? 'bulk_deletedItem' : 'bulk_deletedItems';
                    return localizationService.localize(key, [total]);
                }, confirmDeleteText + '?');
                if (attempt) {
                    attempt.then(function () {
                        //executes if all is successful, let's sync the tree
                        var activeNode = appState.getTreeState('selectedNode');
                        if (activeNode) {
                            navigationService.reloadNode(activeNode);
                        }
                        $scope.getContent();
                    });
                }
            });
        };
        $scope.publish = function () {
            var attempt = applySelected(function (selected, index) {
                return contentResource.publishById(getIdCallback(selected[index]));
            }, function (count, total) {
                var key = total === 1 ? 'bulk_publishedItemOfItem' : 'bulk_publishedItemOfItems';
                return localizationService.localize(key, [
                    count,
                    total
                ]);
            }, function (total) {
                var key = total === 1 ? 'bulk_publishedItem' : 'bulk_publishedItems';
                return localizationService.localize(key, [total]);
            });
            if (attempt) {
                attempt.then(function () {
                    $scope.getContent();
                });
            }
        };
        $scope.unpublish = function () {
            var attempt = applySelected(function (selected, index) {
                return contentResource.unPublish(getIdCallback(selected[index]));
            }, function (count, total) {
                var key = total === 1 ? 'bulk_unpublishedItemOfItem' : 'bulk_unpublishedItemOfItems';
                return localizationService.localize(key, [
                    count,
                    total
                ]);
            }, function (total) {
                var key = total === 1 ? 'bulk_unpublishedItem' : 'bulk_unpublishedItems';
                return localizationService.localize(key, [total]);
            });
            if (attempt) {
                attempt.then(function () {
                    $scope.getContent();
                });
            }
        };
        $scope.move = function () {
            $scope.moveDialog = {};
            $scope.moveDialog.title = localizationService.localize('general_move');
            $scope.moveDialog.section = $scope.entityType;
            $scope.moveDialog.currentNode = $scope.contentId;
            $scope.moveDialog.view = 'move';
            $scope.moveDialog.show = true;
            $scope.moveDialog.submit = function (model) {
                if (model.target) {
                    performMove(model.target);
                }
                $scope.moveDialog.show = false;
                $scope.moveDialog = null;
            };
            $scope.moveDialog.close = function (oldModel) {
                $scope.moveDialog.show = false;
                $scope.moveDialog = null;
            };
        };
        function performMove(target) {
            //NOTE: With the way this applySelected/serial works, I'm not sure there's a better way currently to return 
            // a specific value from one of the methods, so we'll have to try this way. Even though the first method
            // will fire once per every node moved, the destination path will be the same and we need to use that to sync.
            var newPath = null;
            applySelected(function (selected, index) {
                return contentResource.move({
                    parentId: target.id,
                    id: getIdCallback(selected[index])
                }).then(function (path) {
                    newPath = path;
                    return path;
                });
            }, function (count, total) {
                var key = total === 1 ? 'bulk_movedItemOfItem' : 'bulk_movedItemOfItems';
                return localizationService.localize(key, [
                    count,
                    total
                ]);
            }, function (total) {
                var key = total === 1 ? 'bulk_movedItem' : 'bulk_movedItems';
                return localizationService.localize(key, [total]);
            }).then(function () {
                //executes if all is successful, let's sync the tree
                if (newPath) {
                    //we need to do a double sync here: first refresh the node where the content was moved,
                    // then refresh the node where the content was moved from
                    navigationService.syncTree({
                        tree: target.nodeType ? target.nodeType : target.metaData.treeAlias,
                        path: newPath,
                        forceReload: true,
                        activate: false
                    }).then(function (args) {
                        //get the currently edited node (if any)
                        var activeNode = appState.getTreeState('selectedNode');
                        if (activeNode) {
                            navigationService.reloadNode(activeNode);
                        }
                    });
                }
            });
        }
        $scope.copy = function () {
            $scope.copyDialog = {};
            $scope.copyDialog.title = localizationService.localize('general_copy');
            $scope.copyDialog.section = $scope.entityType;
            $scope.copyDialog.currentNode = $scope.contentId;
            $scope.copyDialog.view = 'copy';
            $scope.copyDialog.show = true;
            $scope.copyDialog.submit = function (model) {
                if (model.target) {
                    performCopy(model.target, model.relateToOriginal);
                }
                $scope.copyDialog.show = false;
                $scope.copyDialog = null;
            };
            $scope.copyDialog.close = function (oldModel) {
                $scope.copyDialog.show = false;
                $scope.copyDialog = null;
            };
        };
        function performCopy(target, relateToOriginal) {
            applySelected(function (selected, index) {
                return contentResource.copy({
                    parentId: target.id,
                    id: getIdCallback(selected[index]),
                    relateToOriginal: relateToOriginal
                });
            }, function (count, total) {
                var key = total === 1 ? 'bulk_copiedItemOfItem' : 'bulk_copiedItemOfItems';
                return localizationService.localize(key, [
                    count,
                    total
                ]);
            }, function (total) {
                var key = total === 1 ? 'bulk_copiedItem' : 'bulk_copiedItems';
                return localizationService.localize(key, [total]);
            });
        }
        function getCustomPropertyValue(alias, properties) {
            var value = '';
            var index = 0;
            var foundAlias = false;
            for (var i = 0; i < properties.length; i++) {
                if (properties[i].alias == alias) {
                    foundAlias = true;
                    break;
                }
                index++;
            }
            if (foundAlias) {
                value = properties[index].value;
            }
            return value;
        }
        /** This ensures that the correct value is set for each item in a row, we don't want to call a function during interpolation or ng-bind as performance is really bad that way */
        function setPropertyValues(result) {
            //set the edit url
            result.editPath = createEditUrlCallback(result);
            _.each($scope.options.includeProperties, function (e, i) {
                var alias = e.alias;
                // First try to pull the value directly from the alias (e.g. updatedBy)
                var value = result[alias];
                // If this returns an object, look for the name property of that (e.g. owner.name)
                if (value === Object(value)) {
                    value = value['name'];
                }
                // If we've got nothing yet, look at a user defined property
                if (typeof value === 'undefined') {
                    value = getCustomPropertyValue(alias, result.properties);
                }
                // If we have a date, format it
                if (isDate(value)) {
                    value = value.substring(0, value.length - 3);
                }
                // set what we've got on the result
                result[alias] = value;
            });
        }
        function isDate(val) {
            if (angular.isString(val)) {
                return val.match(/^(\d{4})\-(\d{2})\-(\d{2})\ (\d{2})\:(\d{2})\:(\d{2})$/);
            }
            return false;
        }
        function initView() {
            //default to root id if the id is undefined
            var id = $routeParams.id;
            if (id === undefined) {
                id = -1;
            }
            //$scope.listViewAllowedTypes = getContentTypesCallback(id);
            getContentTypesCallback(id).then(function (listViewAllowedTypes) {
                $scope.listViewAllowedTypes = listViewAllowedTypes;
                var blueprints = false;
                _.each(listViewAllowedTypes, function (allowedType) {
                    if (_.isEmpty(allowedType.blueprints)) {
                        // this helps the view understand that there are no blueprints available
                        allowedType.blueprints = null;
                    } else {
                        blueprints = true;
                    }
                });
                if (listViewAllowedTypes.length === 1 && blueprints === false) {
                    $scope.createAllowedButtonSingle = true;
                }
                if (listViewAllowedTypes.length === 1 && blueprints === true) {
                    $scope.createAllowedButtonSingleWithBlueprints = true;
                }
                if (listViewAllowedTypes.length > 1) {
                    $scope.createAllowedButtonMultiWithBlueprints = true;
                }
            });
            $scope.contentId = id;
            $scope.isTrashed = id === '-20' || id === '-21';
            $scope.options.allowBulkPublish = $scope.options.allowBulkPublish && !$scope.isTrashed;
            $scope.options.allowBulkUnpublish = $scope.options.allowBulkUnpublish && !$scope.isTrashed;
            $scope.options.bulkActionsAllowed = $scope.options.allowBulkPublish || $scope.options.allowBulkUnpublish || $scope.options.allowBulkCopy || $scope.options.allowBulkMove || $scope.options.allowBulkDelete;
            $scope.reloadView($scope.contentId);
        }
        function getLocalizedKey(alias) {
            switch (alias) {
            case 'sortOrder':
                return 'general_sort';
            case 'updateDate':
                return 'content_updateDate';
            case 'updater':
                return 'content_updatedBy';
            case 'createDate':
                return 'content_createDate';
            case 'owner':
                return 'content_createBy';
            case 'published':
                return 'content_isPublished';
            case 'contentTypeAlias':
                //TODO: Check for members
                return $scope.entityType === 'content' ? 'content_documentType' : 'content_mediatype';
            case 'email':
                return 'general_email';
            case 'username':
                return 'general_username';
            }
            return alias;
        }
        function getItemKey(itemId) {
            for (var i = 0; i < $scope.listViewResultSet.items.length; i++) {
                var item = $scope.listViewResultSet.items[i];
                if (item.id === itemId) {
                    return item.key;
                }
            }
        }
        function createBlank(entityType, docTypeAlias) {
            $location.path('/' + entityType + '/' + entityType + '/edit/' + $scope.contentId).search('doctype=' + docTypeAlias + '&create=true');
        }
        function createFromBlueprint(entityType, docTypeAlias, blueprintId) {
            $location.path('/' + entityType + '/' + entityType + '/edit/' + $scope.contentId).search('doctype=' + docTypeAlias + '&create=true&blueprintId=' + blueprintId);
        }
        $scope.createBlank = createBlank;
        $scope.createFromBlueprint = createFromBlueprint;
        //GO!
        initView();
    }
    angular.module('umbraco').controller('Umbraco.PropertyEditors.ListViewController', listViewController);
    function sortByPreValsController($rootScope, $scope, localizationService, editorState, listViewPrevalueHelper) {
        //Get the prevalue from the correct place
        function getPrevalues() {
            if (editorState.current.preValues) {
                return editorState.current.preValues;
            } else {
                return listViewPrevalueHelper.getPrevalues();
            }
        }
        //Watch the prevalues
        $scope.$watch(function () {
            return _.findWhere(getPrevalues(), { key: 'includeProperties' }).value;
        }, function () {
            populateFields();
        }, true);
        //Use deep watching, otherwise we won't pick up header changes
        function populateFields() {
            // Helper to find a particular value from the list of sort by options
            function findFromSortByFields(value) {
                return _.find($scope.sortByFields, function (e) {
                    return e.value.toLowerCase() === value.toLowerCase();
                });
            }
            // Get list of properties assigned as columns of the list view
            var propsPreValue = _.findWhere(getPrevalues(), { key: 'includeProperties' });
            // Populate list of options for the default sort (all the columns plus then node name)
            $scope.sortByFields = [];
            $scope.sortByFields.push({
                value: 'name',
                name: 'Name',
                isSystem: 1
            });
            if (propsPreValue != undefined) {
                for (var i = 0; i < propsPreValue.value.length; i++) {
                    var value = propsPreValue.value[i];
                    $scope.sortByFields.push({
                        value: value.alias,
                        name: value.header,
                        isSystem: value.isSystem
                    });
                }
            }
            // Localize the system fields, for some reason the directive doesn't work inside of the select group with an ng-model declared
            var systemFields = [
                {
                    value: 'SortOrder',
                    key: 'general_sort'
                },
                {
                    value: 'Name',
                    key: 'general_name'
                },
                {
                    value: 'VersionDate',
                    key: 'content_updateDate'
                },
                {
                    value: 'Updater',
                    key: 'content_updatedBy'
                },
                {
                    value: 'CreateDate',
                    key: 'content_createDate'
                },
                {
                    value: 'Owner',
                    key: 'content_createBy'
                },
                {
                    value: 'ContentTypeAlias',
                    key: 'content_documentType'
                },
                {
                    value: 'Published',
                    key: 'content_isPublished'
                },
                {
                    value: 'Email',
                    key: 'general_email'
                },
                {
                    value: 'Username',
                    key: 'general_username'
                }
            ];
            _.each(systemFields, function (e) {
                localizationService.localize(e.key).then(function (v) {
                    var sortByListValue = findFromSortByFields(e.value);
                    if (sortByListValue) {
                        sortByListValue.name = v;
                        switch (e.value) {
                        case 'Updater':
                            e.name += ' (Content only)';
                            break;
                        case 'Published':
                            e.name += ' (Content only)';
                            break;
                        case 'Email':
                            e.name += ' (Members only)';
                            break;
                        case 'Username':
                            e.name += ' (Members only)';
                            break;
                        }
                    }
                });
            });
            // Check existing model value is available in list and ensure a value is set
            var existingValue = findFromSortByFields($scope.model.value);
            if (existingValue) {
                // Set the existing value
                // The old implementation pre Umbraco 7.5 used PascalCase aliases, this uses camelCase, so this ensures that any previous value is set
                $scope.model.value = existingValue.value;
            } else {
                // Existing value not found, set to first value
                $scope.model.value = $scope.sortByFields[0].value;
            }
        }
    }
    angular.module('umbraco').controller('Umbraco.PrevalueEditors.SortByListViewController', sortByPreValsController);
    //DO NOT DELETE THIS, this is in use... 
    angular.module('umbraco').controller('Umbraco.PropertyEditors.MacroContainerController', function ($scope, dialogService, entityResource, macroService) {
        $scope.renderModel = [];
        $scope.allowOpenButton = true;
        $scope.allowRemoveButton = true;
        $scope.sortableOptions = {};
        if ($scope.model.value) {
            var macros = $scope.model.value.split('>');
            angular.forEach(macros, function (syntax, key) {
                if (syntax && syntax.length > 10) {
                    //re-add the char we split on
                    syntax = syntax + '>';
                    var parsed = macroService.parseMacroSyntax(syntax);
                    if (!parsed) {
                        parsed = {};
                    }
                    parsed.syntax = syntax;
                    collectDetails(parsed);
                    $scope.renderModel.push(parsed);
                    setSortingState($scope.renderModel);
                }
            });
        }
        function collectDetails(macro) {
            macro.details = '';
            macro.icon = 'icon-settings-alt';
            if (macro.macroParamsDictionary) {
                angular.forEach(macro.macroParamsDictionary, function (value, key) {
                    macro.details += key + ': ' + value + ' ';
                });
            }
        }
        function openDialog(index) {
            var dialogData = { allowedMacros: $scope.model.config.allowed };
            if (index !== null && $scope.renderModel[index]) {
                var macro = $scope.renderModel[index];
                dialogData['macroData'] = macro;
            }
            $scope.macroPickerOverlay = {};
            $scope.macroPickerOverlay.view = 'macropicker';
            $scope.macroPickerOverlay.dialogData = dialogData;
            $scope.macroPickerOverlay.show = true;
            $scope.macroPickerOverlay.submit = function (model) {
                var macroObject = macroService.collectValueData(model.selectedMacro, model.macroParams, dialogData.renderingEngine);
                collectDetails(macroObject);
                //update the raw syntax and the list...
                if (index !== null && $scope.renderModel[index]) {
                    $scope.renderModel[index] = macroObject;
                } else {
                    $scope.renderModel.push(macroObject);
                }
                setSortingState($scope.renderModel);
                $scope.macroPickerOverlay.show = false;
                $scope.macroPickerOverlay = null;
            };
            $scope.macroPickerOverlay.close = function (oldModel) {
                $scope.macroPickerOverlay.show = false;
                $scope.macroPickerOverlay = null;
            };
        }
        $scope.edit = function (index) {
            openDialog(index);
        };
        $scope.add = function () {
            if ($scope.model.config.max && $scope.model.config.max > 0 && $scope.renderModel.length >= $scope.model.config.max) {
                //cannot add more than the max
                return;
            }
            openDialog();
        };
        $scope.remove = function (index) {
            $scope.renderModel.splice(index, 1);
            setSortingState($scope.renderModel);
        };
        $scope.clear = function () {
            $scope.model.value = '';
            $scope.renderModel = [];
        };
        var unsubscribe = $scope.$on('formSubmitting', function (ev, args) {
            var syntax = [];
            angular.forEach($scope.renderModel, function (value, key) {
                syntax.push(value.syntax);
            });
            $scope.model.value = syntax.join('');
        });
        //when the scope is destroyed we need to unsubscribe
        $scope.$on('$destroy', function () {
            unsubscribe();
        });
        function trim(str, chr) {
            var rgxtrim = !chr ? new RegExp('^\\s+|\\s+$', 'g') : new RegExp('^' + chr + '+|' + chr + '+$', 'g');
            return str.replace(rgxtrim, '');
        }
        function setSortingState(items) {
            // disable sorting if the list only consist of one item
            if (items.length > 1) {
                $scope.sortableOptions.disabled = false;
            } else {
                $scope.sortableOptions.disabled = true;
            }
        }
    });
    function MacroListController($scope, entityResource) {
        $scope.items = [];
        entityResource.getAll('Macro').then(function (items) {
            _.each(items, function (i) {
                $scope.items.push({
                    name: i.name,
                    alias: i.alias
                });
            });
        });
    }
    angular.module('umbraco').controller('Umbraco.PrevalueEditors.MacroList', MacroListController);
    //inject umbracos assetsServce and dialog service
    function MarkdownEditorController($scope, $element, assetsService, dialogService, angularHelper, $timeout) {
        //tell the assets service to load the markdown.editor libs from the markdown editors
        //plugin folder
        if ($scope.model.value === null || $scope.model.value === '') {
            $scope.model.value = $scope.model.config.defaultValue;
        }
        function openMediaPicker(callback) {
            $scope.mediaPickerOverlay = {};
            $scope.mediaPickerOverlay.view = 'mediaPicker';
            $scope.mediaPickerOverlay.show = true;
            $scope.mediaPickerOverlay.disableFolderSelect = true;
            $scope.mediaPickerOverlay.submit = function (model) {
                var selectedImagePath = model.selectedImages[0].image;
                callback(selectedImagePath);
                $scope.mediaPickerOverlay.show = false;
                $scope.mediaPickerOverlay = null;
            };
            $scope.mediaPickerOverlay.close = function (model) {
                $scope.mediaPickerOverlay.show = false;
                $scope.mediaPickerOverlay = null;
            };
        }
        assetsService.load([
            'lib/markdown/markdown.converter.js',
            'lib/markdown/markdown.sanitizer.js',
            'lib/markdown/markdown.editor.js'
        ]).then(function () {
            // we need a short delay to wait for the textbox to appear.
            setTimeout(function () {
                //this function will execute when all dependencies have loaded
                // but in the case that they've been previously loaded, we can only
                // init the md editor after this digest because the DOM needs to be ready first
                // so run the init on a timeout
                $timeout(function () {
                    $scope.markdownEditorInitComplete = false;
                    var converter2 = new Markdown.Converter();
                    var editor2 = new Markdown.Editor(converter2, '-' + $scope.model.alias);
                    editor2.run();
                    //subscribe to the image dialog clicks
                    editor2.hooks.set('insertImageDialog', function (callback) {
                        openMediaPicker(callback);
                        return true;    // tell the editor that we'll take care of getting the image url
                    });
                    editor2.hooks.set('onPreviewRefresh', function () {
                        // We must manually update the model as there is no way to hook into the markdown editor events without exstensive edits to the library.
                        if ($scope.model.value !== $('textarea', $element).val()) {
                            if ($scope.markdownEditorInitComplete) {
                                //only set dirty after init load to avoid "unsaved" dialogue when we don't want it
                                angularHelper.getCurrentForm($scope).$setDirty();
                            } else {
                                $scope.markdownEditorInitComplete = true;
                            }
                            $scope.model.value = $('textarea', $element).val();
                        }
                    });
                }, 200);
            });
            //load the seperat css for the editor to avoid it blocking our js loading TEMP HACK
            assetsService.loadCss('lib/markdown/markdown.css', $scope);
        });
    }
    angular.module('umbraco').controller('Umbraco.PropertyEditors.MarkdownEditorController', MarkdownEditorController);
    //this controller simply tells the dialogs service to open a mediaPicker window
    //with a specified callback, this callback will receive an object with a selection on it
    angular.module('umbraco').controller('Umbraco.PropertyEditors.MediaPickerController', function ($rootScope, $scope, dialogService, entityResource, mediaHelper, $timeout, userService, $location, localizationService) {
        //check the pre-values for multi-picker
        var multiPicker = $scope.model.config.multiPicker && $scope.model.config.multiPicker !== '0' ? true : false;
        var onlyImages = $scope.model.config.onlyImages && $scope.model.config.onlyImages !== '0' ? true : false;
        var disableFolderSelect = $scope.model.config.disableFolderSelect && $scope.model.config.disableFolderSelect !== '0' ? true : false;
        if (!$scope.model.config.startNodeId) {
            if ($scope.model.config.ignoreUserStartNodes === '1') {
                $scope.model.config.startNodeId = -1;
                $scope.model.config.startNodeIsVirtual = true;
            } else {
                userService.getCurrentUser().then(function (userData) {
                    $scope.model.config.startNodeId = userData.startMediaIds.length !== 1 ? -1 : userData.startMediaIds[0];
                    $scope.model.config.startNodeIsVirtual = userData.startMediaIds.length !== 1;
                });
            }
        }
        function setupViewModel() {
            $scope.mediaItems = [];
            $scope.ids = [];
            $scope.isMultiPicker = multiPicker;
            if ($scope.model.value) {
                var ids = $scope.model.value.split(',');
                //NOTE: We need to use the entityResource NOT the mediaResource here because
                // the mediaResource has server side auth configured for which the user must have
                // access to the media section, if they don't they'll get auth errors. The entityResource
                // acts differently in that it allows access if the user has access to any of the apps that
                // might require it's use. Therefore we need to use the metaData property to get at the thumbnail
                // value.
                entityResource.getByIds(ids, 'Media').then(function (medias) {
                    // The service only returns item results for ids that exist (deleted items are silently ignored).
                    // This results in the picked items value to be set to contain only ids of picked items that could actually be found.
                    // Since a referenced item could potentially be restored later on, instead of changing the selected values here based
                    // on whether the items exist during a save event - we should keep "placeholder" items for picked items that currently
                    // could not be fetched. This will preserve references and ensure that the state of an item does not differ depending
                    // on whether it is simply resaved or not.
                    // This is done by remapping the int/guid ids into a new array of items, where we create "Deleted item" placeholders
                    // when there is no match for a selected id. This will ensure that the values being set on save, are the same as before.
                    medias = _.map(ids, function (id) {
                        var found = _.find(medias, function (m) {
                            // We could use coercion (two ='s) here .. but not sure if this works equally well in all browsers and
                            // it's prone to someone "fixing" it at some point without knowing the effects. Rather use toString()
                            // compares and be completely sure it works.
                            return m.udi.toString() === id.toString() || m.id.toString() === id.toString();
                        });
                        if (found) {
                            return found;
                        } else {
                            return {
                                name: localizationService.dictionary.mediaPicker_deletedItem,
                                id: $scope.model.config.idType !== 'udi' ? id : null,
                                udi: $scope.model.config.idType === 'udi' ? id : null,
                                icon: 'icon-picture',
                                thumbnail: null,
                                trashed: true
                            };
                        }
                    });
                    _.each(medias, function (media, i) {
                        // if there is no thumbnail, try getting one if the media is not a placeholder item
                        if (!media.thumbnail && media.id && media.metaData) {
                            media.thumbnail = mediaHelper.resolveFileFromEntity(media, true);
                        }
                        $scope.mediaItems.push(media);
                        if ($scope.model.config.idType === 'udi') {
                            $scope.ids.push(media.udi);
                        } else {
                            $scope.ids.push(media.id);
                        }
                    });
                    $scope.sync();
                });
            }
        }
        setupViewModel();
        $scope.remove = function (index) {
            $scope.mediaItems.splice(index, 1);
            $scope.ids.splice(index, 1);
            $scope.sync();
        };
        $scope.goToItem = function (item) {
            $location.path('media/media/edit/' + item.id);
        };
        $scope.add = function () {
            $scope.mediaPickerOverlay = {
                view: 'mediapicker',
                title: 'Select media',
                startNodeId: $scope.model.config.startNodeId,
                startNodeIsVirtual: $scope.model.config.startNodeIsVirtual,
                dataTypeId: $scope.model && $scope.model.dataTypeId ? $scope.model.dataTypeId : null,
                multiPicker: multiPicker,
                onlyImages: onlyImages,
                disableFolderSelect: disableFolderSelect,
                show: true,
                submit: function (model) {
                    _.each(model.selectedImages, function (media, i) {
                        // if there is no thumbnail, try getting one if the media is not a placeholder item
                        if (!media.thumbnail && media.id && media.metaData) {
                            media.thumbnail = mediaHelper.resolveFileFromEntity(media, true);
                        }
                        $scope.mediaItems.push(media);
                        if ($scope.model.config.idType === 'udi') {
                            $scope.ids.push(media.udi);
                        } else {
                            $scope.ids.push(media.id);
                        }
                    });
                    $scope.sync();
                    $scope.mediaPickerOverlay.show = false;
                    $scope.mediaPickerOverlay = null;
                }
            };
        };
        $scope.sortableOptions = {
            disabled: !$scope.isMultiPicker,
            items: 'li:not(.add-wrapper)',
            cancel: '.unsortable',
            update: function (e, ui) {
                var r = [];
                // TODO: Instead of doing this with a half second delay would be better to use a watch like we do in the
                // content picker. Then we don't have to worry about setting ids, render models, models, we just set one and let the
                // watch do all the rest.
                $timeout(function () {
                    angular.forEach($scope.mediaItems, function (value, key) {
                        r.push($scope.model.config.idType === 'udi' ? value.udi : value.id);
                    });
                    $scope.ids = r;
                    $scope.sync();
                }, 500, false);
            }
        };
        $scope.sync = function () {
            $scope.model.value = $scope.ids.join();
        };
        $scope.showAdd = function () {
            if (!multiPicker) {
                if ($scope.model.value && $scope.model.value !== '') {
                    return false;
                }
            }
            return true;
        };
        //here we declare a special method which will be called whenever the value has changed from the server
        //this is instead of doing a watch on the model.value = faster
        $scope.model.onValueChanged = function (newVal, oldVal) {
            //update the display val again if it has changed from the server
            setupViewModel();
        };
    });
    //this controller simply tells the dialogs service to open a memberPicker window
    //with a specified callback, this callback will receive an object with a selection on it
    function memberGroupPicker($scope, dialogService) {
        function trim(str, chr) {
            var rgxtrim = !chr ? new RegExp('^\\s+|\\s+$', 'g') : new RegExp('^' + chr + '+|' + chr + '+$', 'g');
            return str.replace(rgxtrim, '');
        }
        $scope.renderModel = [];
        $scope.allowRemove = true;
        if ($scope.model.value) {
            var modelIds = $scope.model.value.split(',');
            _.each(modelIds, function (item, i) {
                $scope.renderModel.push({
                    name: item,
                    id: item,
                    icon: 'icon-users'
                });
            });
        }
        $scope.openMemberGroupPicker = function () {
            $scope.memberGroupPicker = {};
            $scope.memberGroupPicker.multiPicker = true;
            $scope.memberGroupPicker.view = 'memberGroupPicker';
            $scope.memberGroupPicker.show = true;
            $scope.memberGroupPicker.submit = function (model) {
                if (model.selectedMemberGroups) {
                    _.each(model.selectedMemberGroups, function (item, i) {
                        $scope.add(item);
                    });
                }
                if (model.selectedMemberGroup) {
                    $scope.clear();
                    $scope.add(model.selectedMemberGroup);
                }
                $scope.memberGroupPicker.show = false;
                $scope.memberGroupPicker = null;
            };
            $scope.memberGroupPicker.close = function (oldModel) {
                $scope.memberGroupPicker.show = false;
                $scope.memberGroupPicker = null;
            };
        };
        $scope.remove = function (index) {
            $scope.renderModel.splice(index, 1);
        };
        $scope.add = function (item) {
            var currIds = _.map($scope.renderModel, function (i) {
                return i.id;
            });
            if (currIds.indexOf(item) < 0) {
                $scope.renderModel.push({
                    name: item,
                    id: item,
                    icon: 'icon-users'
                });
            }
        };
        $scope.clear = function () {
            $scope.renderModel = [];
        };
        var unsubscribe = $scope.$on('formSubmitting', function (ev, args) {
            var currIds = _.map($scope.renderModel, function (i) {
                return i.id;
            });
            $scope.model.value = trim(currIds.join(), ',');
        });
        //when the scope is destroyed we need to unsubscribe
        $scope.$on('$destroy', function () {
            unsubscribe();
        });
    }
    angular.module('umbraco').controller('Umbraco.PropertyEditors.MemberGroupPickerController', memberGroupPicker);
    function memberGroupController($rootScope, $scope, dialogService, mediaResource, imageHelper, $log) {
        //set the available to the keys of the dictionary who's value is true
        $scope.getAvailable = function () {
            var available = [];
            for (var n in $scope.model.value) {
                if ($scope.model.value[n] === false) {
                    available.push(n);
                }
            }
            return available;
        };
        //set the selected to the keys of the dictionary who's value is true
        $scope.getSelected = function () {
            var selected = [];
            for (var n in $scope.model.value) {
                if ($scope.model.value[n] === true) {
                    selected.push(n);
                }
            }
            return selected;
        };
        $scope.addItem = function (item) {
            //keep the model up to date
            $scope.model.value[item] = true;
        };
        $scope.removeItem = function (item) {
            //keep the model up to date
            $scope.model.value[item] = false;
        };
    }
    angular.module('umbraco').controller('Umbraco.PropertyEditors.MemberGroupController', memberGroupController);
    //this controller simply tells the dialogs service to open a memberPicker window
    //with a specified callback, this callback will receive an object with a selection on it
    function memberPickerController($scope, dialogService, entityResource, $log, iconHelper, angularHelper) {
        function trim(str, chr) {
            var rgxtrim = !chr ? new RegExp('^\\s+|\\s+$', 'g') : new RegExp('^' + chr + '+|' + chr + '+$', 'g');
            return str.replace(rgxtrim, '');
        }
        $scope.renderModel = [];
        $scope.allowRemove = true;
        var dialogOptions = {
            multiPicker: false,
            entityType: 'Member',
            section: 'member',
            treeAlias: 'member',
            filter: function (i) {
                return i.metaData.isContainer == true;
            },
            filterCssClass: 'not-allowed',
            callback: function (data) {
                if (angular.isArray(data)) {
                    _.each(data, function (item, i) {
                        $scope.add(item);
                    });
                } else {
                    $scope.clear();
                    $scope.add(data);
                }
                angularHelper.getCurrentForm($scope).$setDirty();
            }
        };
        //since most of the pre-value config's are used in the dialog options (i.e. maxNumber, minNumber, etc...) we'll merge the
        // pre-value config on to the dialog options
        if ($scope.model.config) {
            angular.extend(dialogOptions, $scope.model.config);
        }
        $scope.openMemberPicker = function () {
            $scope.memberPickerOverlay = dialogOptions;
            $scope.memberPickerOverlay.view = 'memberPicker';
            $scope.memberPickerOverlay.show = true;
            $scope.memberPickerOverlay.submit = function (model) {
                if (model.selection) {
                    _.each(model.selection, function (item, i) {
                        $scope.add(item);
                    });
                }
                $scope.memberPickerOverlay.show = false;
                $scope.memberPickerOverlay = null;
            };
            $scope.memberPickerOverlay.close = function (oldModel) {
                $scope.memberPickerOverlay.show = false;
                $scope.memberPickerOverlay = null;
            };
        };
        $scope.remove = function (index) {
            $scope.renderModel.splice(index, 1);
        };
        $scope.add = function (item) {
            var currIds = _.map($scope.renderModel, function (i) {
                if ($scope.model.config.idType === 'udi') {
                    return i.udi;
                } else {
                    return i.id;
                }
            });
            var itemId = $scope.model.config.idType === 'udi' ? item.udi : item.id;
            if (currIds.indexOf(itemId) < 0) {
                item.icon = iconHelper.convertFromLegacyIcon(item.icon);
                $scope.renderModel.push({
                    name: item.name,
                    id: item.id,
                    udi: item.udi,
                    icon: item.icon
                });
            }
        };
        $scope.clear = function () {
            $scope.renderModel = [];
        };
        var unsubscribe = $scope.$on('formSubmitting', function (ev, args) {
            var currIds = _.map($scope.renderModel, function (i) {
                if ($scope.model.config.idType === 'udi') {
                    return i.udi;
                } else {
                    return i.id;
                }
            });
            $scope.model.value = trim(currIds.join(), ',');
        });
        //when the scope is destroyed we need to unsubscribe
        $scope.$on('$destroy', function () {
            unsubscribe();
        });
        //load member data
        var modelIds = $scope.model.value ? $scope.model.value.split(',') : [];
        entityResource.getByIds(modelIds, 'Member').then(function (data) {
            _.each(data, function (item, i) {
                // set default icon if it's missing
                item.icon = item.icon ? iconHelper.convertFromLegacyIcon(item.icon) : 'icon-user';
                $scope.renderModel.push({
                    name: item.name,
                    id: item.id,
                    udi: item.udi,
                    icon: item.icon
                });
            });
        });
    }
    angular.module('umbraco').controller('Umbraco.PropertyEditors.MemberPickerController', memberPickerController);
    function MultipleTextBoxController($scope, $timeout) {
        var backspaceHits = 0;
        // Set the visible prompt to -1 to ensure it will not be visible
        $scope.promptIsVisible = '-1';
        $scope.sortableOptions = {
            axis: 'y',
            containment: 'parent',
            cursor: 'move',
            items: '> div.textbox-wrapper',
            tolerance: 'pointer'
        };
        if (!$scope.model.value) {
            $scope.model.value = [];
        }
        //add any fields that there isn't values for
        if ($scope.model.config.min > 0) {
            for (var i = 0; i < $scope.model.config.min; i++) {
                if (i + 1 > $scope.model.value.length) {
                    $scope.model.value.push({ value: '' });
                }
            }
        }
        $scope.addRemoveOnKeyDown = function (event, index) {
            var txtBoxValue = $scope.model.value[index];
            event.preventDefault();
            switch (event.keyCode) {
            case 13:
                if ($scope.model.config.max <= 0 && txtBoxValue.value || $scope.model.value.length < $scope.model.config.max && txtBoxValue.value) {
                    var newItemIndex = index + 1;
                    $scope.model.value.splice(newItemIndex, 0, { value: '' });
                    //Focus on the newly added value
                    $scope.model.value[newItemIndex].hasFocus = true;
                }
                break;
            case 8:
                if ($scope.model.value.length > $scope.model.config.min) {
                    var remainder = [];
                    // Used to require an extra hit on backspace for the field to be removed
                    if (txtBoxValue.value === '') {
                        backspaceHits++;
                    } else {
                        backspaceHits = 0;
                    }
                    if (txtBoxValue.value === '' && backspaceHits === 2) {
                        for (var x = 0; x < $scope.model.value.length; x++) {
                            if (x !== index) {
                                remainder.push($scope.model.value[x]);
                            }
                        }
                        $scope.model.value = remainder;
                        var prevItemIndex = index - 1;
                        //Set focus back on false as the directive only watches for true
                        if (prevItemIndex >= 0) {
                            $scope.model.value[prevItemIndex].hasFocus = false;
                            $timeout(function () {
                                //Focus on the previous value
                                $scope.model.value[prevItemIndex].hasFocus = true;
                            });
                        }
                        backspaceHits = 0;
                    }
                }
                break;
            default:
            }
        };
        $scope.add = function () {
            if ($scope.model.config.max <= 0 || $scope.model.value.length < $scope.model.config.max) {
                $scope.model.value.push({ value: '' });
                // focus new value
                var newItemIndex = $scope.model.value.length - 1;
                $scope.model.value[newItemIndex].hasFocus = true;
            }
        };
        $scope.remove = function (index) {
            // Make sure not to trigger other prompts when remove is triggered
            $scope.hidePrompt();
            var remainder = [];
            for (var x = 0; x < $scope.model.value.length; x++) {
                if (x !== index) {
                    remainder.push($scope.model.value[x]);
                }
            }
            $scope.model.value = remainder;
        };
        $scope.showPrompt = function (idx, item) {
            var i = $scope.model.value.indexOf(item);
            // Make the prompt visible for the clicked tag only
            if (i === idx) {
                $scope.promptIsVisible = i;
            }
        };
        $scope.hidePrompt = function () {
            $scope.promptIsVisible = '-1';
        };
    }
    angular.module('umbraco').controller('Umbraco.PropertyEditors.MultipleTextBoxController', MultipleTextBoxController);
    function multiUrlPickerController($scope, angularHelper, localizationService, entityResource, iconHelper) {
        $scope.renderModel = [];
        if ($scope.preview) {
            return;
        }
        if (!Array.isArray($scope.model.value)) {
            $scope.model.value = [];
        }
        var currentForm = angularHelper.getCurrentForm($scope);
        $scope.sortableOptions = {
            distance: 10,
            tolerance: 'pointer',
            scroll: true,
            zIndex: 6000,
            update: function () {
                currentForm.$setDirty();
            }
        };
        $scope.model.value.forEach(function (link) {
            link.icon = iconHelper.convertFromLegacyIcon(link.icon);
            $scope.renderModel.push(link);
        });
        $scope.$on('formSubmitting', function () {
            $scope.model.value = $scope.renderModel;
        });
        $scope.$watch(function () {
            return $scope.renderModel.length;
        }, function () {
            if ($scope.model.config && $scope.model.config.minNumber) {
                $scope.multiUrlPickerForm.minCount.$setValidity('minCount', +$scope.model.config.minNumber <= $scope.renderModel.length);
            }
            if ($scope.model.config && $scope.model.config.maxNumber) {
                $scope.multiUrlPickerForm.maxCount.$setValidity('maxCount', +$scope.model.config.maxNumber >= $scope.renderModel.length);
            }
            $scope.sortableOptions.disabled = $scope.renderModel.length === 1;
        });
        $scope.remove = function ($index) {
            $scope.renderModel.splice($index, 1);
            currentForm.$setDirty();
        };
        $scope.openLinkPicker = function (link, $index) {
            var target = link ? {
                name: link.name,
                anchor: link.queryString,
                // the linkPicker breaks if it get an udi for media
                udi: link.isMedia ? null : link.udi,
                url: link.url,
                target: link.target
            } : null;
            $scope.linkPickerOverlay = {
                view: 'linkpicker',
                currentTarget: target,
                dataTypeId: $scope.model && $scope.model.dataTypeId ? $scope.model.dataTypeId : null,
                ignoreUserStartNodes: $scope.model.config && $scope.model.config.ignoreUserStartNodes ? $scope.model.config.ignoreUserStartNodes : '0',
                show: true,
                submit: function (model) {
                    if (model.target.url || model.target.anchor) {
                        // if an anchor exists, check that it is appropriately prefixed
                        if (model.target.anchor && model.target.anchor[0] !== '?' && model.target.anchor[0] !== '#') {
                            model.target.anchor = (model.target.anchor.indexOf('=') === -1 ? '#' : '?') + model.target.anchor;
                        }
                        if (link) {
                            if (link.isMedia && link.url === model.target.url) {
                            } else {
                                link.udi = model.target.udi;
                                link.isMedia = model.target.isMedia;
                            }
                            link.name = model.target.name || model.target.url || model.target.anchor;
                            link.queryString = model.target.anchor;
                            link.target = model.target.target;
                            link.url = model.target.url;
                        } else {
                            link = {
                                isMedia: model.target.isMedia,
                                name: model.target.name || model.target.url || model.target.anchor,
                                queryString: model.target.anchor,
                                target: model.target.target,
                                udi: model.target.udi,
                                url: model.target.url
                            };
                            $scope.renderModel.push(link);
                        }
                        if (link.udi) {
                            var entityType = link.isMedia ? 'media' : 'document';
                            entityResource.getById(link.udi, entityType).then(function (data) {
                                link.icon = iconHelper.convertFromLegacyIcon(data.icon);
                                link.published = data.metaData && data.metaData.IsPublished === false && entityType === 'Document' ? false : true;
                                link.trashed = data.trashed;
                                if (link.trashed) {
                                    item.url = localizationService.dictionary.general_recycleBin;
                                }
                            });
                        } else {
                            link.icon = 'icon-link';
                            link.published = true;
                        }
                        currentForm.$setDirty();
                    }
                    $scope.linkPickerOverlay.show = false;
                    $scope.linkPickerOverlay = null;
                }
            };
        };
    }
    angular.module('umbraco').controller('Umbraco.PropertyEditors.MultiUrlPickerController', multiUrlPickerController);
    angular.module('umbraco').controller('Umbraco.PropertyEditors.NestedContent.DocTypePickerController', [
        '$scope',
        'Umbraco.PropertyEditors.NestedContent.Resources',
        function ($scope, ncResources) {
            $scope.add = function () {
                $scope.model.value.push({
                    // As per PR #4, all stored content type aliases must be prefixed "nc" for easier recognition.
                    // For good measure we'll also prefix the tab alias "nc"
                    ncAlias: '',
                    ncTabAlias: '',
                    nameTemplate: ''
                });
            };
            $scope.remove = function (index) {
                $scope.model.value.splice(index, 1);
            };
            $scope.sortableOptions = {
                axis: 'y',
                cursor: 'move',
                handle: '.icon-navigation'
            };
            $scope.docTypeTabs = {};
            ncResources.getContentTypes().then(function (docTypes) {
                $scope.model.docTypes = docTypes;
                // Populate document type tab dictionary
                docTypes.forEach(function (value) {
                    $scope.docTypeTabs[value.alias] = value.tabs;
                });
            });
            $scope.selectableDocTypesFor = function (config) {
                // return all doctypes that are:
                // 1. either already selected for this config, or
                // 2. not selected in any other config
                return _.filter($scope.model.docTypes, function (docType) {
                    return docType.alias === config.ncAlias || !_.find($scope.model.value, function (c) {
                        return docType.alias === c.ncAlias;
                    });
                });
            };
            if (!$scope.model.value) {
                $scope.model.value = [];
                $scope.add();
            }
        }
    ]);
    angular.module('umbraco').controller('Umbraco.PropertyEditors.NestedContent.PropertyEditorController', [
        '$scope',
        '$interpolate',
        '$filter',
        '$timeout',
        'contentResource',
        'localizationService',
        'iconHelper',
        function ($scope, $interpolate, $filter, $timeout, contentResource, localizationService, iconHelper) {
            //$scope.model.config.contentTypes;
            //$scope.model.config.minItems;
            //$scope.model.config.maxItems;
            //console.log($scope);
            var inited = false;
            _.each($scope.model.config.contentTypes, function (contentType) {
                contentType.nameExp = !!contentType.nameTemplate ? $interpolate(contentType.nameTemplate) : undefined;
            });
            $scope.editIconTitle = '';
            $scope.moveIconTitle = '';
            $scope.deleteIconTitle = '';
            // localize the edit icon title
            localizationService.localize('general_edit').then(function (value) {
                $scope.editIconTitle = value;
            });
            // localize the delete icon title
            localizationService.localize('general_delete').then(function (value) {
                $scope.deleteIconTitle = value;
            });
            // localize the move icon title
            localizationService.localize('actions_move').then(function (value) {
                $scope.moveIconTitle = value;
            });
            $scope.nodes = [];
            $scope.currentNode = undefined;
            $scope.realCurrentNode = undefined;
            $scope.scaffolds = undefined;
            $scope.sorting = false;
            $scope.minItems = $scope.model.config.minItems || 0;
            $scope.maxItems = $scope.model.config.maxItems || 0;
            if ($scope.maxItems == 0)
                $scope.maxItems = 1000;
            $scope.singleMode = $scope.minItems == 1 && $scope.maxItems == 1;
            $scope.showIcons = $scope.model.config.showIcons || true;
            $scope.wideMode = $scope.model.config.hideLabel == '1';
            // helper to force the current form into the dirty state
            $scope.setDirty = function () {
                if ($scope.propertyForm) {
                    $scope.propertyForm.$setDirty();
                }
            };
            $scope.addNode = function (alias) {
                var scaffold = $scope.getScaffold(alias);
                var newNode = initNode(scaffold, null);
                $scope.currentNode = newNode;
                $scope.setDirty();
            };
            $scope.openNodeTypePicker = function ($event) {
                if ($scope.nodes.length >= $scope.maxItems) {
                    return;
                }
                $scope.overlayMenu = {
                    title: localizationService.localize('grid_insertControl'),
                    show: false,
                    style: {},
                    filter: $scope.scaffolds.length > 15 ? true : false,
                    orderBy: '$index',
                    view: 'itempicker',
                    event: $event,
                    submit: function (model) {
                        if (model && model.selectedItem) {
                            $scope.addNode(model.selectedItem.alias);
                        }
                        $scope.overlayMenu.show = false;
                        $scope.overlayMenu = null;
                    },
                    close: function () {
                        $scope.overlayMenu.show = false;
                        $scope.overlayMenu = null;
                    }
                };
                // this could be used for future limiting on node types
                $scope.overlayMenu.availableItems = [];
                _.each($scope.scaffolds, function (scaffold) {
                    $scope.overlayMenu.availableItems.push({
                        alias: scaffold.contentTypeAlias,
                        name: scaffold.contentTypeName,
                        icon: iconHelper.convertFromLegacyIcon(scaffold.icon)
                    });
                });
                if ($scope.overlayMenu.availableItems.length === 0) {
                    return;
                }
                if ($scope.overlayMenu.availableItems.length === 1) {
                    // only one scaffold type - no need to display the picker
                    $scope.addNode($scope.scaffolds[0].contentTypeAlias);
                    return;
                }
                $scope.overlayMenu.show = true;
            };
            $scope.editNode = function (idx) {
                if ($scope.currentNode && $scope.currentNode.key == $scope.nodes[idx].key) {
                    $scope.currentNode = undefined;
                } else {
                    $scope.currentNode = $scope.nodes[idx];
                }
            };
            $scope.deleteNode = function (idx) {
                if ($scope.nodes.length > $scope.model.config.minItems) {
                    if ($scope.model.config.confirmDeletes && $scope.model.config.confirmDeletes == 1) {
                        localizationService.localize('content_nestedContentDeleteItem').then(function (value) {
                            if (confirm(value)) {
                                $scope.nodes.splice(idx, 1);
                                $scope.setDirty();
                                updateModel();
                            }
                        });
                    } else {
                        $scope.nodes.splice(idx, 1);
                        $scope.setDirty();
                        updateModel();
                    }
                }
            };
            $scope.getName = function (idx) {
                var name = 'Item ' + (idx + 1);
                if ($scope.model.value[idx]) {
                    var contentType = $scope.getContentTypeConfig($scope.model.value[idx].ncContentTypeAlias);
                    if (contentType != null && contentType.nameExp) {
                        // Run the expression against the stored dictionary value, NOT the node object
                        var item = $scope.model.value[idx];
                        // Add a temporary index property
                        item['$index'] = idx + 1;
                        var newName = contentType.nameExp(item);
                        if (newName && (newName = $.trim(newName))) {
                            name = newName;
                        }
                        // Delete the index property as we don't want to persist it
                        delete item['$index'];
                    }
                }
                // Update the nodes actual name value
                if ($scope.nodes[idx].name !== name) {
                    $scope.nodes[idx].name = name;
                }
                return name;
            };
            $scope.getIcon = function (idx) {
                var scaffold = $scope.getScaffold($scope.model.value[idx].ncContentTypeAlias);
                return scaffold && scaffold.icon ? iconHelper.convertFromLegacyIcon(scaffold.icon) : 'icon-folder';
            };
            $scope.sortableOptions = {
                axis: 'y',
                cursor: 'move',
                handle: '.umb-nested-content__icon--move',
                start: function (ev, ui) {
                    updateModel();
                    // Yea, yea, we shouldn't modify the dom, sue me
                    $('#umb-nested-content--' + $scope.model.id + ' .umb-rte textarea').each(function () {
                        tinymce.execCommand('mceRemoveEditor', false, $(this).attr('id'));
                        $(this).css('visibility', 'hidden');
                    });
                    $scope.$apply(function () {
                        $scope.sorting = true;
                    });
                },
                update: function (ev, ui) {
                    $scope.setDirty();
                },
                stop: function (ev, ui) {
                    $('#umb-nested-content--' + $scope.model.id + ' .umb-rte textarea').each(function () {
                        tinymce.execCommand('mceAddEditor', true, $(this).attr('id'));
                        $(this).css('visibility', 'visible');
                    });
                    $scope.$apply(function () {
                        $scope.sorting = false;
                        updateModel();
                    });
                }
            };
            $scope.getScaffold = function (alias) {
                return _.find($scope.scaffolds, function (scaffold) {
                    return scaffold.contentTypeAlias == alias;
                });
            };
            $scope.getContentTypeConfig = function (alias) {
                return _.find($scope.model.config.contentTypes, function (contentType) {
                    return contentType.ncAlias == alias;
                });
            };
            var notSupported = [
                'Umbraco.Tags',
                'Umbraco.UploadField',
                'Umbraco.ImageCropper'
            ];
            // Initialize
            var scaffoldsLoaded = 0;
            $scope.scaffolds = [];
            _.each($scope.model.config.contentTypes, function (contentType) {
                contentResource.getScaffold(-20, contentType.ncAlias).then(function (scaffold) {
                    // remove all tabs except the specified tab
                    var tab = _.find(scaffold.tabs, function (tab) {
                        return tab.id != 0 && (tab.alias.toLowerCase() == contentType.ncTabAlias.toLowerCase() || contentType.ncTabAlias == '');
                    });
                    scaffold.tabs = [];
                    if (tab) {
                        scaffold.tabs.push(tab);
                        angular.forEach(tab.properties, function (property) {
                            if (_.find(notSupported, function (x) {
                                    return x === property.editor;
                                })) {
                                property.notSupported = true;
                                //TODO: Not supported message to be replaced with 'content_nestedContentEditorNotSupported' dictionary key. Currently not possible due to async/timing quirk.
                                property.notSupportedMessage = 'Property ' + property.label + ' uses editor ' + property.editor + ' which is not supported by Nested Content.';
                            }
                        });
                    }
                    // Store the scaffold object
                    $scope.scaffolds.push(scaffold);
                    scaffoldsLoaded++;
                    initIfAllScaffoldsHaveLoaded();
                }, function (error) {
                    scaffoldsLoaded++;
                    initIfAllScaffoldsHaveLoaded();
                });
            });
            var initIfAllScaffoldsHaveLoaded = function () {
                // Initialize when all scaffolds have loaded
                if ($scope.model.config.contentTypes.length == scaffoldsLoaded) {
                    // Because we're loading the scaffolds async one at a time, we need to
                    // sort them explicitly according to the sort order defined by the data type.
                    var contentTypeAliases = [];
                    _.each($scope.model.config.contentTypes, function (contentType) {
                        contentTypeAliases.push(contentType.ncAlias);
                    });
                    $scope.scaffolds = $filter('orderBy')($scope.scaffolds, function (s) {
                        return contentTypeAliases.indexOf(s.contentTypeAlias);
                    });
                    // Convert stored nodes
                    if ($scope.model.value) {
                        for (var i = 0; i < $scope.model.value.length; i++) {
                            var item = $scope.model.value[i];
                            var scaffold = $scope.getScaffold(item.ncContentTypeAlias);
                            if (scaffold == null) {
                                // No such scaffold - the content type might have been deleted. We need to skip it.
                                continue;
                            }
                            initNode(scaffold, item);
                        }
                    }
                    // Enforce min items
                    if ($scope.nodes.length < $scope.model.config.minItems) {
                        for (var i = $scope.nodes.length; i < $scope.model.config.minItems; i++) {
                            $scope.addNode($scope.scaffolds[0].contentTypeAlias);
                        }
                    }
                    // If there is only one item, set it as current node
                    if ($scope.singleMode || $scope.nodes.length == 1 && $scope.maxItems == 1) {
                        $scope.currentNode = $scope.nodes[0];
                    }
                    inited = true;
                }
            };
            var initNode = function (scaffold, item) {
                var node = angular.copy(scaffold);
                node.key = item && item.key ? item.key : UUID.generate();
                node.ncContentTypeAlias = scaffold.contentTypeAlias;
                for (var t = 0; t < node.tabs.length; t++) {
                    var tab = node.tabs[t];
                    for (var p = 0; p < tab.properties.length; p++) {
                        var prop = tab.properties[p];
                        prop.propertyAlias = prop.alias;
                        prop.alias = $scope.model.alias + '___' + prop.alias;
                        // Force validation to occur server side as this is the
                        // only way we can have consistancy between mandatory and
                        // regex validation messages. Not ideal, but it works.
                        prop.validation = {
                            mandatory: false,
                            pattern: ''
                        };
                        if (item) {
                            if (item[prop.propertyAlias]) {
                                prop.value = item[prop.propertyAlias];
                            }
                        }
                    }
                }
                $scope.nodes.push(node);
                return node;
            };
            var updateModel = function () {
                if ($scope.realCurrentNode) {
                    $scope.$broadcast('ncSyncVal', { key: $scope.realCurrentNode.key });
                }
                if (inited) {
                    var newValues = [];
                    for (var i = 0; i < $scope.nodes.length; i++) {
                        var node = $scope.nodes[i];
                        var newValue = {
                            key: node.key,
                            name: node.name,
                            ncContentTypeAlias: node.ncContentTypeAlias
                        };
                        for (var t = 0; t < node.tabs.length; t++) {
                            var tab = node.tabs[t];
                            for (var p = 0; p < tab.properties.length; p++) {
                                var prop = tab.properties[p];
                                if (typeof prop.value !== 'function') {
                                    newValue[prop.propertyAlias] = prop.value;
                                }
                            }
                        }
                        newValues.push(newValue);
                    }
                    $scope.model.value = newValues;
                }
            };
            $scope.$watch('currentNode', function (newVal) {
                updateModel();
                $scope.realCurrentNode = newVal;
            });
            var unsubscribe = $scope.$on('formSubmitting', function (ev, args) {
                updateModel();
            });
            $scope.$on('$destroy', function () {
                unsubscribe();
            });
            //TODO: Move this into a shared location?
            var UUID = function () {
                var self = {};
                var lut = [];
                for (var i = 0; i < 256; i++) {
                    lut[i] = (i < 16 ? '0' : '') + i.toString(16);
                }
                self.generate = function () {
                    var d0 = Math.random() * 4294967295 | 0;
                    var d1 = Math.random() * 4294967295 | 0;
                    var d2 = Math.random() * 4294967295 | 0;
                    var d3 = Math.random() * 4294967295 | 0;
                    return lut[d0 & 255] + lut[d0 >> 8 & 255] + lut[d0 >> 16 & 255] + lut[d0 >> 24 & 255] + '-' + lut[d1 & 255] + lut[d1 >> 8 & 255] + '-' + lut[d1 >> 16 & 15 | 64] + lut[d1 >> 24 & 255] + '-' + lut[d2 & 63 | 128] + lut[d2 >> 8 & 255] + '-' + lut[d2 >> 16 & 255] + lut[d2 >> 24 & 255] + lut[d3 & 255] + lut[d3 >> 8 & 255] + lut[d3 >> 16 & 255] + lut[d3 >> 24 & 255];
                };
                return self;
            }();
        }
    ]);
    angular.module('umbraco').controller('Umbraco.PropertyEditors.RadioButtonsController', function ($scope) {
        if (angular.isObject($scope.model.config.items)) {
            //now we need to format the items in the dictionary because we always want to have an array
            var newItems = [];
            var vals = _.values($scope.model.config.items);
            var keys = _.keys($scope.model.config.items);
            for (var i = 0; i < vals.length; i++) {
                newItems.push({
                    id: keys[i],
                    sortOrder: vals[i].sortOrder,
                    value: vals[i].value
                });
            }
            //ensure the items are sorted by the provided sort order
            newItems.sort(function (a, b) {
                return a.sortOrder > b.sortOrder ? 1 : b.sortOrder > a.sortOrder ? -1 : 0;
            });
            //re-assign
            $scope.model.config.items = newItems;
        }
    });
    /**
 * @ngdoc controller
 * @name Umbraco.Editors.ReadOnlyValueController
 * @function
 * 
 * @description
 * The controller for the readonlyvalue property editor. 
 *  This controller offer more functionality than just a simple label as it will be able to apply formatting to the 
 *  value to be displayed. This means that we also have to apply more complex logic of watching the model value when 
 *  it changes because we are creating a new scope value called displayvalue which will never change based on the server data.
 *  In some cases after a form submission, the server will modify the data that has been persisted, especially in the cases of 
 *  readonlyvalues so we need to ensure that after the form is submitted that the new data is reflected here.
*/
    function ReadOnlyValueController($rootScope, $scope, $filter) {
        function formatDisplayValue() {
            if ($scope.model.config && angular.isArray($scope.model.config) && $scope.model.config.length > 0 && $scope.model.config[0] && $scope.model.config.filter) {
                if ($scope.model.config.format) {
                    $scope.displayvalue = $filter($scope.model.config.filter)($scope.model.value, $scope.model.config.format);
                } else {
                    $scope.displayvalue = $filter($scope.model.config.filter)($scope.model.value);
                }
            } else {
                $scope.displayvalue = $scope.model.value;
            }
        }
        //format the display value on init:
        formatDisplayValue();
        $scope.$watch('model.value', function (newVal, oldVal) {
            //cannot just check for !newVal because it might be an empty string which we 
            //want to look for.
            if (newVal !== null && newVal !== undefined && newVal !== oldVal) {
                //update the display val again
                formatDisplayValue();
            }
        });
    }
    angular.module('umbraco').controller('Umbraco.PropertyEditors.ReadOnlyValueController', ReadOnlyValueController);
    angular.module('umbraco').controller('Umbraco.PropertyEditors.RelatedLinksController', function ($rootScope, $scope, dialogService, iconHelper) {
        if (!$scope.model.value) {
            $scope.model.value = [];
        }
        $scope.model.config.max = isNumeric($scope.model.config.max) && $scope.model.config.max !== 0 ? $scope.model.config.max : Number.MAX_VALUE;
        $scope.newCaption = '';
        $scope.newLink = 'http://';
        $scope.newNewWindow = false;
        $scope.newInternal = null;
        $scope.newInternalName = '';
        $scope.newInternalIcon = null;
        $scope.addExternal = true;
        $scope.currentEditLink = null;
        $scope.hasError = false;
        var dataTypeId = $scope.model && $scope.model.dataTypeId ? $scope.model.dataTypeId : null;
        $scope.internal = function ($event) {
            $scope.currentEditLink = null;
            $scope.contentPickerOverlay = {};
            $scope.contentPickerOverlay.view = 'contentpicker';
            $scope.contentPickerOverlay.multiPicker = false;
            $scope.contentPickerOverlay.show = true;
            $scope.contentPickerOverlay.dataTypeId = dataTypeId;
            $scope.contentPickerOverlay.idType = $scope.model.config.idType ? $scope.model.config.idType : 'int';
            $scope.contentPickerOverlay.submit = function (model) {
                select(model.selection[0]);
                $scope.contentPickerOverlay.show = false;
                $scope.contentPickerOverlay = null;
            };
            $scope.contentPickerOverlay.close = function (oldModel) {
                $scope.contentPickerOverlay.show = false;
                $scope.contentPickerOverlay = null;
            };
            $event.preventDefault();
        };
        $scope.selectInternal = function ($event, link) {
            $scope.currentEditLink = link;
            $scope.contentPickerOverlay = {};
            $scope.contentPickerOverlay.view = 'contentpicker';
            $scope.contentPickerOverlay.multiPicker = false;
            $scope.contentPickerOverlay.show = true;
            $scope.contentPickerOverlay.dataTypeId = dataTypeId;
            $scope.contentPickerOverlay.idType = $scope.model.config.idType ? $scope.model.config.idType : 'int';
            $scope.contentPickerOverlay.submit = function (model) {
                select(model.selection[0]);
                $scope.contentPickerOverlay.show = false;
                $scope.contentPickerOverlay = null;
            };
            $scope.contentPickerOverlay.close = function (oldModel) {
                $scope.contentPickerOverlay.show = false;
                $scope.contentPickerOverlay = null;
            };
            $event.preventDefault();
        };
        $scope.edit = function (idx) {
            for (var i = 0; i < $scope.model.value.length; i++) {
                $scope.model.value[i].edit = false;
            }
            $scope.model.value[idx].edit = true;
        };
        $scope.saveEdit = function (idx) {
            $scope.model.value[idx].title = $scope.model.value[idx].caption;
            $scope.model.value[idx].edit = false;
        };
        $scope.delete = function (idx) {
            $scope.model.value.splice(idx, 1);
        };
        $scope.add = function ($event) {
            if (!angular.isArray($scope.model.value)) {
                $scope.model.value = [];
            }
            if ($scope.newCaption == '') {
                $scope.hasError = true;
            } else {
                if ($scope.addExternal) {
                    var newExtLink = new function () {
                        this.caption = $scope.newCaption;
                        this.link = $scope.newLink;
                        this.newWindow = $scope.newNewWindow;
                        this.edit = false;
                        this.isInternal = false;
                        this.type = 'external';
                        this.title = $scope.newCaption;
                    }();
                    $scope.model.value.push(newExtLink);
                } else {
                    var newIntLink = new function () {
                        this.caption = $scope.newCaption;
                        this.link = $scope.newInternal;
                        this.newWindow = $scope.newNewWindow;
                        this.internal = $scope.newInternal;
                        this.edit = false;
                        this.isInternal = true;
                        this.internalName = $scope.newInternalName;
                        this.internalIcon = $scope.newInternalIcon;
                        this.type = 'internal';
                        this.title = $scope.newCaption;
                    }();
                    $scope.model.value.push(newIntLink);
                }
                $scope.newCaption = '';
                $scope.newLink = 'http://';
                $scope.newNewWindow = false;
                $scope.newInternal = null;
                $scope.newInternalName = '';
                $scope.newInternalIcon = null;
            }
            $event.preventDefault();
        };
        $scope.switch = function ($event) {
            $scope.addExternal = !$scope.addExternal;
            $event.preventDefault();
        };
        $scope.switchLinkType = function ($event, link) {
            link.isInternal = !link.isInternal;
            link.type = link.isInternal ? 'internal' : 'external';
            if (!link.isInternal)
                link.link = $scope.newLink;
            $event.preventDefault();
        };
        $scope.move = function (index, direction) {
            var temp = $scope.model.value[index];
            $scope.model.value[index] = $scope.model.value[index + direction];
            $scope.model.value[index + direction] = temp;
        };
        //helper for determining if a user can add items
        $scope.canAdd = function () {
            return $scope.model.config.max <= 0 || $scope.model.config.max > countVisible();
        };
        //helper that returns if an item can be sorted
        $scope.canSort = function () {
            return countVisible() > 1;
        };
        $scope.sortableOptions = {
            axis: 'y',
            handle: '.handle',
            cursor: 'move',
            cancel: '.no-drag',
            containment: 'parent',
            placeholder: 'sortable-placeholder',
            forcePlaceholderSize: true,
            helper: function (e, ui) {
                // When sorting table rows, the cells collapse. This helper fixes that: https://www.foliotek.com/devblog/make-table-rows-sortable-using-jquery-ui-sortable/
                ui.children().each(function () {
                    $(this).width($(this).width());
                });
                return ui;
            },
            items: '> tr:not(.unsortable)',
            tolerance: 'pointer',
            update: function (e, ui) {
                // Get the new and old index for the moved element (using the URL as the identifier)
                var newIndex = ui.item.index();
                var movedLinkUrl = ui.item.attr('data-link');
                var originalIndex = getElementIndexByUrl(movedLinkUrl);
                // Move the element in the model
                var movedElement = $scope.model.value[originalIndex];
                $scope.model.value.splice(originalIndex, 1);
                $scope.model.value.splice(newIndex, 0, movedElement);
            },
            start: function (e, ui) {
                //ui.placeholder.html("<td colspan='5'></td>");
                // Build a placeholder cell that spans all the cells in the row: https://stackoverflow.com/questions/25845310/jquery-ui-sortable-and-table-cell-size
                var cellCount = 0;
                $('td, th', ui.helper).each(function () {
                    // For each td or th try and get it's colspan attribute, and add that or 1 to the total
                    var colspan = 1;
                    var colspanAttr = $(this).attr('colspan');
                    if (colspanAttr > 1) {
                        colspan = colspanAttr;
                    }
                    cellCount += colspan;
                });
                // Add the placeholder UI - note that this is the item's content, so td rather than tr - and set height of tr
                ui.placeholder.html('<td colspan="' + cellCount + '"></td>').height(ui.item.height());
            }
        };
        //helper to count what is visible
        function countVisible() {
            return $scope.model.value.length;
        }
        function isNumeric(n) {
            return !isNaN(parseFloat(n)) && isFinite(n);
        }
        function getElementIndexByUrl(url) {
            for (var i = 0; i < $scope.model.value.length; i++) {
                if ($scope.model.value[i].link == url) {
                    return i;
                }
            }
            return -1;
        }
        function select(data) {
            if ($scope.currentEditLink != null) {
                $scope.currentEditLink.internal = $scope.model.config.idType === 'udi' ? data.udi : data.id;
                $scope.currentEditLink.internalName = data.name;
                $scope.currentEditLink.internalIcon = iconHelper.convertFromLegacyIcon(data.icon);
                $scope.currentEditLink.link = $scope.model.config.idType === 'udi' ? data.udi : data.id;
            } else {
                $scope.newInternal = $scope.model.config.idType === 'udi' ? data.udi : data.id;
                $scope.newInternalName = data.name;
                $scope.newInternalIcon = iconHelper.convertFromLegacyIcon(data.icon);
            }
        }
    });
    angular.module('umbraco').controller('Umbraco.PropertyEditors.RTEController', function ($rootScope, $scope, $q, $locale, dialogService, $log, imageHelper, assetsService, $timeout, tinyMceService, angularHelper, stylesheetResource, macroService, editorState, entityResource) {
        $scope.isLoading = true;
        //To id the html textarea we need to use the datetime ticks because we can have multiple rte's per a single property alias
        // because now we have to support having 2x (maybe more at some stage) content editors being displayed at once. This is because
        // we have this mini content editor panel that can be launched with MNTP.
        var d = new Date();
        var n = d.getTime();
        $scope.textAreaHtmlId = $scope.model.alias + '_' + n + '_rte';
        function syncContent(editor) {
            editor.save();
            angularHelper.safeApply($scope, function () {
                $scope.model.value = editor.getContent();
            });
            //make the form dirty manually so that the track changes works, setting our model doesn't trigger
            // the angular bits because tinymce replaces the textarea.
            angularHelper.getCurrentForm($scope).$setDirty();
        }
        tinyMceService.configuration().then(function (tinyMceConfig) {
            //config value from general tinymce.config file
            var validElements = tinyMceConfig.validElements;
            //These are absolutely required in order for the macros to render inline
            //we put these as extended elements because they get merged on top of the normal allowed elements by tiny mce
            var extendedValidElements = '@[id|class|style],-div[id|dir|class|align|style],ins[datetime|cite],-ul[class|style],-li[class|style],span[id|class|style]';
            var invalidElements = tinyMceConfig.inValidElements;
            var plugins = _.map(tinyMceConfig.plugins, function (plugin) {
                if (plugin.useOnFrontend) {
                    return plugin.name;
                }
            }).join(' ');
            var editorConfig = $scope.model.config.editor;
            if (!editorConfig || angular.isString(editorConfig)) {
                editorConfig = tinyMceService.defaultPrevalues();
            }
            //config value on the data type
            var toolbar = editorConfig.toolbar.join(' | ');
            var stylesheets = [];
            var styleFormats = [];
            var await = [];
            if (!editorConfig.maxImageSize && editorConfig.maxImageSize != 0) {
                editorConfig.maxImageSize = tinyMceService.defaultPrevalues().maxImageSize;
            }
            var dataTypeId = $scope.model && $scope.model.dataTypeId ? $scope.model.dataTypeId : null;
            //queue file loading
            if (typeof tinymce === 'undefined') {
                // Don't reload tinymce if already loaded
                await.push(assetsService.loadJs('lib/tinymce/tinymce.min.js', $scope));
            }
            //queue rules loading
            angular.forEach(editorConfig.stylesheets, function (val, key) {
                stylesheets.push(Umbraco.Sys.ServerVariables.umbracoSettings.cssPath + '/' + val + '.css?' + new Date().getTime());
                await.push(stylesheetResource.getRulesByName(val).then(function (rules) {
                    angular.forEach(rules, function (rule) {
                        var r = {};
                        r.title = rule.name;
                        if (rule.selector[0] == '.') {
                            r.inline = 'span';
                            r.classes = rule.selector.substring(1);
                        } else if (rule.selector[0] == '#') {
                            r.inline = 'span';
                            r.attributes = { id: rule.selector.substring(1) };
                        } else if (rule.selector[0] != '.' && rule.selector.indexOf('.') > -1) {
                            var split = rule.selector.split('.');
                            r.block = split[0];
                            r.classes = rule.selector.substring(rule.selector.indexOf('.') + 1).replace('.', ' ');
                        } else if (rule.selector[0] != '#' && rule.selector.indexOf('#') > -1) {
                            var split = rule.selector.split('#');
                            r.block = split[0];
                            r.classes = rule.selector.substring(rule.selector.indexOf('#') + 1);
                        } else {
                            r.block = rule.selector;
                        }
                        styleFormats.push(r);
                    });
                }));
            });
            //stores a reference to the editor
            var tinyMceEditor = null;
            // these languages are available for localization
            var availableLanguages = [
                'da',
                'de',
                'en',
                'en_us',
                'fi',
                'fr',
                'he',
                'it',
                'ja',
                'nl',
                'no',
                'pl',
                'pt',
                'ru',
                'sv',
                'zh'
            ];
            //define fallback language
            var language = 'en_us';
            //get locale from angular and match tinymce format. Angular localization is always in the format of ru-ru, de-de, en-gb, etc.
            //wheras tinymce is in the format of ru, de, en, en_us, etc.
            var localeId = $locale.id.replace('-', '_');
            //try matching the language using full locale format
            var languageMatch = _.find(availableLanguages, function (o) {
                return o === localeId;
            });
            //if no matches, try matching using only the language
            if (languageMatch === undefined) {
                var localeParts = localeId.split('_');
                languageMatch = _.find(availableLanguages, function (o) {
                    return o === localeParts[0];
                });
            }
            //if a match was found - set the language
            if (languageMatch !== undefined) {
                language = languageMatch;
            }
            //wait for queue to end
            $q.all(await).then(function () {
                //create a baseline Config to exten upon
                var baseLineConfigObj = {
                    mode: 'exact',
                    skin: 'umbraco',
                    plugins: plugins,
                    valid_elements: validElements,
                    invalid_elements: invalidElements,
                    extended_valid_elements: extendedValidElements,
                    menubar: false,
                    statusbar: false,
                    relative_urls: false,
                    height: editorConfig.dimensions.height,
                    width: editorConfig.dimensions.width,
                    maxImageSize: editorConfig.maxImageSize,
                    toolbar: toolbar,
                    content_css: stylesheets,
                    style_formats: styleFormats,
                    language: language,
                    //see http://archive.tinymce.com/wiki.php/Configuration:cache_suffix
                    cache_suffix: '?umb__rnd=' + Umbraco.Sys.ServerVariables.application.cacheBuster
                };
                if (tinyMceConfig.customConfig) {
                    //if there is some custom config, we need to see if the string value of each item might actually be json and if so, we need to
                    // convert it to json instead of having it as a string since this is what tinymce requires
                    for (var i in tinyMceConfig.customConfig) {
                        var val = tinyMceConfig.customConfig[i];
                        if (val) {
                            val = val.toString().trim();
                            if (val.detectIsJson()) {
                                try {
                                    tinyMceConfig.customConfig[i] = JSON.parse(val);
                                    //now we need to check if this custom config key is defined in our baseline, if it is we don't want to
                                    //overwrite the baseline config item if it is an array, we want to concat the items in the array, otherwise
                                    //if it's an object it will overwrite the baseline
                                    if (angular.isArray(baseLineConfigObj[i]) && angular.isArray(tinyMceConfig.customConfig[i])) {
                                        //concat it and below this concat'd array will overwrite the baseline in angular.extend
                                        tinyMceConfig.customConfig[i] = baseLineConfigObj[i].concat(tinyMceConfig.customConfig[i]);
                                    }
                                } catch (e) {
                                }
                            }
                            if (val === 'true') {
                                tinyMceConfig.customConfig[i] = true;
                            }
                            if (val === 'false') {
                                tinyMceConfig.customConfig[i] = false;
                            }
                        }
                    }
                    angular.extend(baseLineConfigObj, tinyMceConfig.customConfig);
                }
                //set all the things that user configs should not be able to override
                baseLineConfigObj.elements = $scope.textAreaHtmlId;
                //this is the exact textarea id to replace!
                baseLineConfigObj.setup = function (editor) {
                    //set the reference
                    tinyMceEditor = editor;
                    //enable browser based spell checking
                    editor.on('init', function (e) {
                        editor.getBody().setAttribute('spellcheck', true);
                    });
                    //We need to listen on multiple things here because of the nature of tinymce, it doesn't
                    //fire events when you think!
                    //The change event doesn't fire when content changes, only when cursor points are changed and undo points
                    //are created. the blur event doesn't fire if you insert content into the editor with a button and then
                    //press save.
                    //We have a couple of options, one is to do a set timeout and check for isDirty on the editor, or we can
                    //listen to both change and blur and also on our own 'saving' event. I think this will be best because a
                    //timer might end up using unwanted cpu and we'd still have to listen to our saving event in case they clicked
                    //save before the timeout elapsed.
                    //TODO: We need to re-enable something like this to ensure the track changes is working with tinymce
                    // so we can detect if the form is dirty or not, Per has some better events to use as this one triggers
                    // even if you just enter/exit with mouse cursuor which doesn't really mean it's changed.
                    // see: http://issues.umbraco.org/issue/U4-4485
                    //var alreadyDirty = false;
                    //editor.on('change', function (e) {
                    //    angularHelper.safeApply($scope, function () {
                    //        $scope.model.value = editor.getContent();
                    //        if (!alreadyDirty) {
                    //            //make the form dirty manually so that the track changes works, setting our model doesn't trigger
                    //            // the angular bits because tinymce replaces the textarea.
                    //            var currForm = angularHelper.getCurrentForm($scope);
                    //            currForm.$setDirty();
                    //            alreadyDirty = true;
                    //        }
                    //    });
                    //});
                    //when we leave the editor (maybe)
                    editor.on('blur', function (e) {
                        editor.save();
                        angularHelper.safeApply($scope, function () {
                            $scope.model.value = editor.getContent();
                        });
                    });
                    //when buttons modify content
                    editor.on('ExecCommand', function (e) {
                        syncContent(editor);
                    });
                    // Update model on keypress
                    editor.on('KeyUp', function (e) {
                        syncContent(editor);
                    });
                    // Update model on change, i.e. copy/pasted text, plugins altering content
                    editor.on('SetContent', function (e) {
                        if (!e.initial) {
                            syncContent(editor);
                        }
                    });
                    editor.on('ObjectResized', function (e) {
                        var qs = '?width=' + e.width + '&height=' + e.height + '&mode=max';
                        var srcAttr = $(e.target).attr('src');
                        var path = srcAttr.split('?')[0];
                        $(e.target).attr('data-mce-src', path + qs);
                        syncContent(editor);
                    });
                    tinyMceService.createLinkPicker(editor, $scope, function (currentTarget, anchorElement) {
                        entityResource.getAnchors($scope.model.value).then(function (anchorValues) {
                            $scope.linkPickerOverlay = {
                                view: 'linkpicker',
                                currentTarget: currentTarget,
                                anchors: anchorValues,
                                dataTypeId: dataTypeId,
                                ignoreUserStartNodes: $scope.model.config.ignoreUserStartNodes,
                                show: true,
                                submit: function (model) {
                                    tinyMceService.insertLinkInEditor(editor, model.target, anchorElement);
                                    $scope.linkPickerOverlay.show = false;
                                    $scope.linkPickerOverlay = null;
                                }
                            };
                        });
                    });
                    //Create the insert media plugin
                    tinyMceService.createMediaPicker(editor, $scope, function (currentTarget, userData) {
                        var startNodeId = userData.startMediaIds.length !== 1 ? -1 : userData.startMediaIds[0];
                        var startNodeIsVirtual = userData.startMediaIds.length !== 1;
                        if ($scope.model.config.ignoreUserStartNodes === '1') {
                            startNodeId = -1;
                            startNodeIsVirtual = true;
                        }
                        $scope.mediaPickerOverlay = {
                            currentTarget: currentTarget,
                            onlyImages: true,
                            showDetails: true,
                            disableFolderSelect: true,
                            startNodeId: startNodeId,
                            startNodeIsVirtual: startNodeIsVirtual,
                            dataTypeId: dataTypeId,
                            view: 'mediapicker',
                            show: true,
                            submit: function (model) {
                                tinyMceService.insertMediaInEditor(editor, model.selectedImages[0]);
                                $scope.mediaPickerOverlay.show = false;
                                $scope.mediaPickerOverlay = null;
                            }
                        };
                    });
                    //Create the embedded plugin
                    tinyMceService.createInsertEmbeddedMedia(editor, $scope, function () {
                        $scope.embedOverlay = {
                            view: 'embed',
                            show: true,
                            submit: function (model) {
                                tinyMceService.insertEmbeddedMediaInEditor(editor, model.embed.preview);
                                $scope.embedOverlay.show = false;
                                $scope.embedOverlay = null;
                            }
                        };
                    });
                    //Create the insert macro plugin
                    tinyMceService.createInsertMacro(editor, $scope, function (dialogData) {
                        $scope.macroPickerOverlay = {
                            view: 'macropicker',
                            dialogData: dialogData,
                            show: true,
                            submit: function (model) {
                                var macroObject = macroService.collectValueData(model.selectedMacro, model.macroParams, dialogData.renderingEngine);
                                tinyMceService.insertMacroInEditor(editor, macroObject, $scope);
                                $scope.macroPickerOverlay.show = false;
                                $scope.macroPickerOverlay = null;
                            }
                        };
                    });
                };
                /** Loads in the editor */
                function loadTinyMce() {
                    //we need to add a timeout here, to force a redraw so TinyMCE can find
                    //the elements needed
                    $timeout(function () {
                        tinymce.DOM.events.domLoaded = true;
                        tinymce.init(baseLineConfigObj);
                        $scope.isLoading = false;
                    }, 200, false);
                }
                loadTinyMce();
                //here we declare a special method which will be called whenever the value has changed from the server
                //this is instead of doing a watch on the model.value = faster
                $scope.model.onValueChanged = function (newVal, oldVal) {
                    //update the display val again if it has changed from the server;
                    //uses an empty string in the editor when the value is null
                    tinyMceEditor.setContent(newVal || '', { format: 'raw' });
                    //we need to manually fire this event since it is only ever fired based on loading from the DOM, this
                    // is required for our plugins listening to this event to execute
                    tinyMceEditor.fire('LoadContent', null);
                };
                //listen for formSubmitting event (the result is callback used to remove the event subscription)
                var unsubscribe = $scope.$on('formSubmitting', function () {
                    //TODO: Here we should parse out the macro rendered content so we can save on a lot of bytes in data xfer
                    // we do parse it out on the server side but would be nice to do that on the client side before as well.
                    if (tinyMceEditor !== undefined && tinyMceEditor != null && !$scope.isLoading) {
                        $scope.model.value = tinyMceEditor.getContent();
                    }
                });
                //when the element is disposed we need to unsubscribe!
                // NOTE: this is very important otherwise if this is part of a modal, the listener still exists because the dom
                // element might still be there even after the modal has been hidden.
                $scope.$on('$destroy', function () {
                    unsubscribe();
                    if (tinyMceEditor !== undefined && tinyMceEditor != null) {
                        tinyMceEditor.destroy();
                    }
                });
            });
        });
    });
    angular.module('umbraco').controller('Umbraco.PrevalueEditors.RteController', function ($scope, $timeout, $log, tinyMceService, stylesheetResource, assetsService) {
        var cfg = tinyMceService.defaultPrevalues();
        if ($scope.model.value) {
            if (angular.isString($scope.model.value)) {
                $scope.model.value = cfg;
            }
        } else {
            $scope.model.value = cfg;
        }
        if (!$scope.model.value.stylesheets) {
            $scope.model.value.stylesheets = [];
        }
        if (!$scope.model.value.toolbar) {
            $scope.model.value.toolbar = [];
        }
        if (!$scope.model.value.maxImageSize && $scope.model.value.maxImageSize != 0) {
            $scope.model.value.maxImageSize = cfg.maxImageSize;
        }
        tinyMceService.configuration().then(function (config) {
            $scope.tinyMceConfig = config;
            // extend commands with properties for font-icon and if it is a custom command
            $scope.tinyMceConfig.commands = _.map($scope.tinyMceConfig.commands, function (obj) {
                var icon = getFontIcon(obj.frontEndCommand);
                return angular.extend(obj, {
                    fontIcon: icon.name,
                    isCustom: icon.isCustom
                });
            });
        });
        stylesheetResource.getAll().then(function (stylesheets) {
            $scope.stylesheets = stylesheets;
        });
        $scope.selected = function (cmd, alias, lookup) {
            if (lookup && angular.isArray(lookup)) {
                cmd.selected = lookup.indexOf(alias) >= 0;
                return cmd.selected;
            }
            return false;
        };
        $scope.selectCommand = function (command) {
            var index = $scope.model.value.toolbar.indexOf(command.frontEndCommand);
            if (command.selected && index === -1) {
                $scope.model.value.toolbar.push(command.frontEndCommand);
            } else if (index >= 0) {
                $scope.model.value.toolbar.splice(index, 1);
            }
        };
        $scope.selectStylesheet = function (css) {
            var index = $scope.model.value.stylesheets.indexOf(css.name);
            if (css.selected && index === -1) {
                $scope.model.value.stylesheets.push(css.name);
            } else if (index >= 0) {
                $scope.model.value.stylesheets.splice(index, 1);
            }
        };
        // map properties for specific commands
        function getFontIcon(alias) {
            var icon = {
                name: alias,
                isCustom: false
            };
            switch (alias) {
            case 'codemirror':
                icon.name = 'code';
                icon.isCustom = false;
                break;
            case 'styleselect':
            case 'fontsizeselect':
                icon.name = 'icon-list';
                icon.isCustom = true;
                break;
            case 'umbembeddialog':
                icon.name = 'icon-tv';
                icon.isCustom = true;
                break;
            case 'umbmediapicker':
                icon.name = 'icon-picture';
                icon.isCustom = true;
                break;
            case 'umbmacro':
                icon.name = 'icon-settings-alt';
                icon.isCustom = true;
                break;
            case 'umbmacro':
                icon.name = 'icon-settings-alt';
                icon.isCustom = true;
                break;
            default:
                icon.name = alias;
                icon.isCustom = false;
            }
            return icon;
        }
        var unsubscribe = $scope.$on('formSubmitting', function (ev, args) {
            var commands = _.where($scope.tinyMceConfig.commands, { selected: true });
            $scope.model.value.toolbar = _.pluck(commands, 'frontEndCommand');
        });
        // when the scope is destroyed we need to unsubscribe
        $scope.$on('$destroy', function () {
            unsubscribe();
        });
        // load TinyMCE skin which contains css for font-icons
        assetsService.loadCss('lib/tinymce/skins/umbraco/skin.min.css', $scope);
    });
    function sliderController($scope, $log, $element, assetsService, angularHelper) {
        //configure some defaults
        if (!$scope.model.config.orientation) {
            $scope.model.config.orientation = 'horizontal';
        }
        if (!$scope.model.config.enableRange) {
            $scope.model.config.enableRange = false;
        } else {
            $scope.model.config.enableRange = $scope.model.config.enableRange === '1' ? true : false;
        }
        if (!$scope.model.config.initVal1) {
            $scope.model.config.initVal1 = 0;
        } else {
            $scope.model.config.initVal1 = parseFloat($scope.model.config.initVal1);
        }
        if (!$scope.model.config.initVal2) {
            $scope.model.config.initVal2 = 0;
        } else {
            $scope.model.config.initVal2 = parseFloat($scope.model.config.initVal2);
        }
        if (!$scope.model.config.minVal) {
            $scope.model.config.minVal = 0;
        } else {
            $scope.model.config.minVal = parseFloat($scope.model.config.minVal);
        }
        if (!$scope.model.config.maxVal) {
            $scope.model.config.maxVal = 100;
        } else {
            $scope.model.config.maxVal = parseFloat($scope.model.config.maxVal);
        }
        if (!$scope.model.config.step) {
            $scope.model.config.step = 1;
        } else {
            $scope.model.config.step = parseFloat($scope.model.config.step);
        }
        if (!$scope.model.config.handle) {
            $scope.model.config.handle = 'round';
        }
        if (!$scope.model.config.reversed) {
            $scope.model.config.reversed = false;
        } else {
            $scope.model.config.reversed = $scope.model.config.reversed === '1' ? true : false;
        }
        if (!$scope.model.config.tooltip) {
            $scope.model.config.tooltip = 'show';
        }
        if (!$scope.model.config.tooltipSplit) {
            $scope.model.config.tooltipSplit = false;
        } else {
            $scope.model.config.tooltipSplit = $scope.model.config.tooltipSplit === '1' ? true : false;
        }
        if ($scope.model.config.tooltipFormat) {
            $scope.model.config.formatter = function (value) {
                if (angular.isArray(value) && $scope.model.config.enableRange) {
                    return $scope.model.config.tooltipFormat.replace('{0}', value[0]).replace('{1}', value[1]);
                } else {
                    return $scope.model.config.tooltipFormat.replace('{0}', value);
                }
            };
        }
        if (!$scope.model.config.ticks) {
            $scope.model.config.ticks = [];
        } else {
            // returns comma-separated string to an array, e.g. [0, 100, 200, 300, 400]
            $scope.model.config.ticks = _.map($scope.model.config.ticks.split(','), function (item) {
                return parseInt(item.trim());
            });
        }
        if (!$scope.model.config.ticksPositions) {
            $scope.model.config.ticksPositions = [];
        } else {
            // returns comma-separated string to an array, e.g. [0, 30, 60, 70, 90, 100]
            $scope.model.config.ticksPositions = _.map($scope.model.config.ticksPositions.split(','), function (item) {
                return parseInt(item.trim());
            });
        }
        if (!$scope.model.config.ticksLabels) {
            $scope.model.config.ticksLabels = [];
        } else {
            // returns comma-separated string to an array, e.g. ['$0', '$100', '$200', '$300', '$400']
            $scope.model.config.ticksLabels = _.map($scope.model.config.ticksLabels.split(','), function (item) {
                return item.trim();
            });
        }
        if (!$scope.model.config.ticksSnapBounds) {
            $scope.model.config.ticksSnapBounds = 0;
        } else {
            $scope.model.config.ticksSnapBounds = parseFloat($scope.model.config.ticksSnapBounds);
        }
        /** This creates the slider with the model values - it's called on startup and if the model value changes */
        function createSlider() {
            //the value that we'll give the slider - if it's a range, we store our value as a comma separated val but this slider expects an array
            var sliderVal = null;
            //configure the model value based on if range is enabled or not
            if ($scope.model.config.enableRange == true) {
                //If no value saved yet - then use default value
                //If it contains a single value - then also create a new array value
                if (!$scope.model.value || $scope.model.value.indexOf(',') == -1) {
                    var i1 = parseFloat($scope.model.config.initVal1);
                    var i2 = parseFloat($scope.model.config.initVal2);
                    sliderVal = [
                        isNaN(i1) ? $scope.model.config.minVal : i1 >= $scope.model.config.minVal ? i1 : $scope.model.config.minVal,
                        isNaN(i2) ? $scope.model.config.maxVal : i2 >= i1 ? i2 <= $scope.model.config.maxVal ? i2 : $scope.model.config.maxVal : $scope.model.config.maxVal
                    ];
                } else {
                    //this will mean it's a delimited value stored in the db, convert it to an array
                    sliderVal = _.map($scope.model.value.split(','), function (item) {
                        return parseFloat(item);
                    });
                }
            } else {
                //If no value saved yet - then use default value
                if ($scope.model.value) {
                    sliderVal = parseFloat($scope.model.value);
                } else {
                    sliderVal = $scope.model.config.initVal1;
                }
            }
            // Initialise model value if not set
            if (!$scope.model.value) {
                setModelValueFromSlider(sliderVal);
            }
            //initiate slider, add event handler and get the instance reference (stored in data)
            var slider = $element.find('.slider-item').bootstrapSlider({
                max: $scope.model.config.maxVal,
                min: $scope.model.config.minVal,
                orientation: $scope.model.config.orientation,
                selection: $scope.model.config.reversed ? 'after' : 'before',
                step: $scope.model.config.step,
                precision: $scope.model.config.precision,
                tooltip: $scope.model.config.tooltip,
                tooltip_split: $scope.model.config.tooltipSplit,
                tooltip_position: $scope.model.config.tooltipPosition,
                handle: $scope.model.config.handle,
                reversed: $scope.model.config.reversed,
                ticks: $scope.model.config.ticks,
                ticks_positions: $scope.model.config.ticksPositions,
                ticks_labels: $scope.model.config.ticksLabels,
                ticks_snap_bounds: $scope.model.config.ticksSnapBounds,
                formatter: $scope.model.config.formatter,
                range: $scope.model.config.enableRange,
                //set the slider val - we cannot do this with data- attributes when using ranges
                value: sliderVal
            }).on('slideStop', function (e) {
                var value = e.value;
                angularHelper.safeApply($scope, function () {
                    setModelValueFromSlider(value);
                });
            }).data('slider');
        }
        /** Called on start-up when no model value has been applied and on change of the slider via the UI - updates
        the model with the currently selected slider value(s) **/
        function setModelValueFromSlider(sliderVal) {
            //Get the value from the slider and format it correctly, if it is a range we want a comma delimited value
            if ($scope.model.config.enableRange == true) {
                $scope.model.value = sliderVal.join(',');
            } else {
                $scope.model.value = sliderVal.toString();
            }
        }
        //tell the assetsService to load the bootstrap slider
        //libs from the plugin folder
        assetsService.loadJs('lib/slider/js/bootstrap-slider.js').then(function () {
            createSlider();
            //here we declare a special method which will be called whenever the value has changed from the server
            //this is instead of doing a watch on the model.value = faster
            $scope.model.onValueChanged = function (newVal, oldVal) {
                if (newVal != oldVal) {
                    createSlider();
                }
            };
        });
        //load the separate css for the editor to avoid it blocking our js loading
        assetsService.loadCss('lib/slider/bootstrap-slider.css', $scope);
        assetsService.loadCss('lib/slider/bootstrap-slider-custom.css', $scope);
    }
    angular.module('umbraco').controller('Umbraco.PropertyEditors.SliderController', sliderController);
    angular.module('umbraco').controller('Umbraco.PropertyEditors.TagsController', function ($rootScope, $scope, $log, assetsService, umbRequestHelper, angularHelper, $timeout, $element) {
        var $typeahead;
        $scope.isLoading = true;
        $scope.tagToAdd = '';
        function setModelValue(val) {
            $scope.model.value = val || $scope.model.value;
            if ($scope.model.value) {
                if (!$scope.model.config.storageType || $scope.model.config.storageType !== 'Json') {
                    //it is csv
                    if (!$scope.model.value) {
                        $scope.model.value = [];
                    } else {
                        if ($scope.model.value.length > 0) {
                            // split the csv string, and remove any duplicate values
                            var tempArray = $scope.model.value.split(',').map(function (v) {
                                return v.trim();
                            });
                            $scope.model.value = tempArray.filter(function (v, i, self) {
                                return self.indexOf(v) === i;
                            });
                        }
                    }
                }
            } else {
                $scope.model.value = [];
            }
        }
        assetsService.loadJs('lib/typeahead.js/typeahead.bundle.min.js', $scope).then(function () {
            $scope.isLoading = false;
            //load current value
            setModelValue();
            // Method required by the valPropertyValidator directive (returns true if the property editor has at least one tag selected)
            $scope.validateMandatory = function () {
                return {
                    isValid: !$scope.model.validation.mandatory || $scope.model.value != null && $scope.model.value.length > 0,
                    errorMsg: 'Value cannot be empty',
                    errorKey: 'required'
                };
            };
            //Helper method to add a tag on enter or on typeahead select
            function addTag(tagToAdd) {
                if (tagToAdd != null && tagToAdd.length > 0) {
                    if ($scope.model.value.indexOf(tagToAdd) < 0) {
                        $scope.model.value.push(tagToAdd);
                        //this is required to re-validate
                        $scope.propertyForm.tagCount.$setViewValue($scope.model.value.length);
                    }
                }
            }
            $scope.addTagOnEnter = function (e) {
                var code = e.keyCode || e.which;
                if (code == 13) {
                    //Enter keycode
                    if ($element.find('.tags-' + $scope.model.alias).parent().find('.tt-dropdown-menu .tt-cursor').length === 0) {
                        //this is required, otherwise the html form will attempt to submit.
                        e.preventDefault();
                        $scope.addTag();
                    }
                }
            };
            $scope.addTag = function () {
                //ensure that we're not pressing the enter key whilst selecting a typeahead value from the drop down
                //we need to use jquery because typeahead duplicates the text box
                addTag($scope.tagToAdd);
                $scope.tagToAdd = '';
                //this clears the value stored in typeahead so it doesn't try to add the text again
                // https://issues.umbraco.org/issue/U4-4947
                $typeahead.typeahead('val', '');
            };
            // Set the visible prompt to -1 to ensure it will not be visible
            $scope.promptIsVisible = '-1';
            $scope.removeTag = function (tag) {
                var i = $scope.model.value.indexOf(tag);
                if (i >= 0) {
                    // Make sure to hide the prompt so it does not stay open because another item gets a new number in the array index
                    $scope.promptIsVisible = '-1';
                    // Remove the tag from the index
                    $scope.model.value.splice(i, 1);
                    //this is required to re-validate
                    $scope.propertyForm.tagCount.$setViewValue($scope.model.value.length);
                }
            };
            $scope.showPrompt = function (idx, tag) {
                var i = $scope.model.value.indexOf(tag);
                // Make the prompt visible for the clicked tag only
                if (i === idx) {
                    $scope.promptIsVisible = i;
                }
            };
            $scope.hidePrompt = function () {
                $scope.promptIsVisible = '-1';
            };
            //vice versa
            $scope.model.onValueChanged = function (newVal, oldVal) {
                //update the display val again if it has changed from the server
                setModelValue(newVal);
            };
            //configure the tags data source
            //helper method to format the data for bloodhound
            function dataTransform(list) {
                //transform the result to what bloodhound wants
                var tagList = _.map(list, function (i) {
                    return { value: i.text };
                });
                // remove current tags from the list
                return $.grep(tagList, function (tag) {
                    return $.inArray(tag.value, $scope.model.value) === -1;
                });
            }
            // helper method to remove current tags
            function removeCurrentTagsFromSuggestions(suggestions) {
                return $.grep(suggestions, function (suggestion) {
                    return $.inArray(suggestion.value, $scope.model.value) === -1;
                });
            }
            var tagsHound = new Bloodhound({
                datumTokenizer: Bloodhound.tokenizers.obj.whitespace('value'),
                queryTokenizer: Bloodhound.tokenizers.whitespace,
                dupDetector: function (remoteMatch, localMatch) {
                    return remoteMatch['value'] == localMatch['value'];
                },
                //pre-fetch the tags for this category
                prefetch: {
                    url: umbRequestHelper.getApiUrl('tagsDataBaseUrl', 'GetTags', [{ tagGroup: $scope.model.config.group }]),
                    //TTL = 5 minutes
                    ttl: 300000,
                    filter: dataTransform
                },
                //dynamically get the tags for this category (they may have changed on the server)
                remote: {
                    url: umbRequestHelper.getApiUrl('tagsDataBaseUrl', 'GetTags', [{ tagGroup: $scope.model.config.group }]),
                    filter: dataTransform
                }
            });
            tagsHound.initialize(true);
            //configure the type ahead
            $timeout(function () {
                $typeahead = $element.find('.tags-' + $scope.model.alias).typeahead({
                    //This causes some strangeness as it duplicates the textbox, best leave off for now.
                    hint: false,
                    highlight: true,
                    cacheKey: new Date(),
                    // Force a cache refresh each time the control is initialized
                    minLength: 1
                }, {
                    //see: https://github.com/twitter/typeahead.js/blob/master/doc/jquery_typeahead.md#options
                    // name = the data set name, we'll make this the tag group name
                    name: $scope.model.config.group,
                    displayKey: 'value',
                    source: function (query, cb) {
                        tagsHound.get(query, function (suggestions) {
                            cb(removeCurrentTagsFromSuggestions(suggestions));
                        });
                    }
                }).bind('typeahead:selected', function (obj, datum, name) {
                    angularHelper.safeApply($scope, function () {
                        addTag(datum['value']);
                        $scope.tagToAdd = '';
                        // clear the typed text
                        $typeahead.typeahead('val', '');
                    });
                }).bind('typeahead:autocompleted', function (obj, datum, name) {
                    angularHelper.safeApply($scope, function () {
                        addTag(datum['value']);
                        $scope.tagToAdd = '';
                    });
                }).bind('typeahead:opened', function (obj) {
                });
            });
            $scope.$on('$destroy', function () {
                tagsHound.clearPrefetchCache();
                tagsHound.clearRemoteCache();
                $element.find('.tags-' + $scope.model.alias).typeahead('destroy');
                delete tagsHound;
            });
        });
    });
    //this controller simply tells the dialogs service to open a mediaPicker window
    //with a specified callback, this callback will receive an object with a selection on it
    angular.module('umbraco').controller('Umbraco.PropertyEditors.EmbeddedContentController', function ($rootScope, $scope, $log) {
        $scope.showForm = false;
        $scope.fakeData = [];
        $scope.create = function () {
            $scope.showForm = true;
            $scope.fakeData = angular.copy($scope.model.config.fields);
        };
        $scope.show = function () {
            $scope.showCode = true;
        };
        $scope.add = function () {
            $scope.showForm = false;
            if (!($scope.model.value instanceof Array)) {
                $scope.model.value = [];
            }
            $scope.model.value.push(angular.copy($scope.fakeData));
            $scope.fakeData = [];
        };
    });
    function textAreaController($scope) {
        // macro parameter editor doesn't contains a config object,
        // so we create a new one to hold any properties 
        if (!$scope.model.config) {
            $scope.model.config = {};
        }
        if (!$scope.model.config.maxChars) {
            $scope.model.config.maxChars = false;
        }
        $scope.model.maxlength = false;
        if ($scope.model.config && $scope.model.config.maxChars) {
            $scope.model.maxlength = true;
            if ($scope.model.value == undefined) {
                $scope.model.count = $scope.model.config.maxChars * 1;
            } else {
                $scope.model.count = $scope.model.config.maxChars * 1 - $scope.model.value.length;
            }
        }
        $scope.model.change = function () {
            if ($scope.model.config && $scope.model.config.maxChars) {
                if ($scope.model.value == undefined) {
                    $scope.model.count = $scope.model.config.maxChars * 1;
                } else {
                    $scope.model.count = $scope.model.config.maxChars * 1 - $scope.model.value.length;
                }
                if ($scope.model.count < 0) {
                    $scope.model.value = $scope.model.value.substring(0, $scope.model.config.maxChars * 1);
                    $scope.model.count = 0;
                }
            }
        };
    }
    angular.module('umbraco').controller('Umbraco.PropertyEditors.textAreaController', textAreaController);
    function textboxController($scope) {
        // macro parameter editor doesn't contains a config object,
        // so we create a new one to hold any properties
        if (!$scope.model.config) {
            $scope.model.config = {};
        }
        $scope.model.maxlength = false;
        if ($scope.model.config && $scope.model.config.maxChars) {
            $scope.model.maxlength = true;
        }
        if (!$scope.model.config.maxChars) {
            // 500 is the maximum number that can be stored
            // in the database, so set it to the max, even
            // if no max is specified in the config
            $scope.model.config.maxChars = 500;
        }
        if ($scope.model.maxlength) {
            if ($scope.model.value === undefined) {
                $scope.model.count = $scope.model.config.maxChars * 1;
            } else {
                $scope.model.count = $scope.model.config.maxChars * 1 - $scope.model.value.length;
            }
        }
        $scope.model.change = function () {
            if ($scope.model.config && $scope.model.config.maxChars) {
                if ($scope.model.value === undefined) {
                    $scope.model.count = $scope.model.config.maxChars * 1;
                } else {
                    $scope.model.count = $scope.model.config.maxChars * 1 - $scope.model.value.length;
                }
                if ($scope.model.count < 0) {
                    $scope.model.value = $scope.model.value.substring(0, $scope.model.config.maxChars * 1);
                    $scope.model.count = 0;
                }
            }
        };
    }
    angular.module('umbraco').controller('Umbraco.PropertyEditors.textboxController', textboxController);
    angular.module('umbraco').controller('Umbraco.PropertyEditors.UrlListController', function ($rootScope, $scope, $filter) {
        function formatDisplayValue() {
            if (angular.isArray($scope.model.value)) {
                //it's the json value
                $scope.renderModel = _.map($scope.model.value, function (item) {
                    return {
                        url: item.url,
                        linkText: item.linkText,
                        urlTarget: item.target ? item.target : '_blank',
                        icon: item.icon ? item.icon : 'icon-out'
                    };
                });
            } else {
                //it's the default csv value
                $scope.renderModel = _.map($scope.model.value.split(','), function (item) {
                    return {
                        url: item,
                        linkText: '',
                        urlTarget: $scope.config && $scope.config.target ? $scope.config.target : '_blank',
                        icon: $scope.config && $scope.config.icon ? $scope.config.icon : 'icon-out'
                    };
                });
            }
        }
        $scope.getUrl = function (valueUrl) {
            if (valueUrl.indexOf('/') >= 0) {
                return valueUrl;
            }
            return '#';
        };
        formatDisplayValue();
        //here we declare a special method which will be called whenever the value has changed from the server
        //this is instead of doing a watch on the model.value = faster
        $scope.model.onValueChanged = function (newVal, oldVal) {
            //update the display val again
            formatDisplayValue();
        };
    });
    (function () {
        'use strict';
        function ScriptsCreateController($scope, $location, navigationService, formHelper, codefileResource, localizationService, appState) {
            var vm = this;
            var node = $scope.dialogOptions.currentNode;
            var localizeCreateFolder = localizationService.localize('defaultdialog_createFolder');
            vm.creatingFolder = false;
            vm.folderName = '';
            vm.createFolderError = '';
            vm.fileExtension = '';
            vm.createFile = createFile;
            vm.showCreateFolder = showCreateFolder;
            vm.createFolder = createFolder;
            function createFile() {
                $location.path('/settings/scripts/edit/' + node.id).search('create', 'true');
                navigationService.hideMenu();
            }
            function showCreateFolder() {
                vm.creatingFolder = true;
            }
            function createFolder(form) {
                if (formHelper.submitForm({
                        scope: $scope,
                        formCtrl: form,
                        statusMessage: localizeCreateFolder
                    })) {
                    codefileResource.createContainer('scripts', node.id, vm.folderName).then(function (saved) {
                        navigationService.hideMenu();
                        navigationService.syncTree({
                            tree: 'scripts',
                            path: saved.path,
                            forceReload: true,
                            activate: true
                        });
                        formHelper.resetForm({ scope: $scope });
                        var section = appState.getSectionState('currentSection');
                    }, function (err) {
                        vm.createFolderError = err;
                        formHelper.showNotifications(err.data);
                    });
                }
            }
        }
        angular.module('umbraco').controller('Umbraco.Editors.Scripts.CreateController', ScriptsCreateController);
    }());
    /**
 * @ngdoc controller
 * @name Umbraco.Editors.Scripts.DeleteController
 * @function
 *
 * @description
 * The controller for deleting scripts
 */
    function ScriptsDeleteController($scope, codefileResource, treeService, navigationService) {
        $scope.performDelete = function () {
            //mark it for deletion (used in the UI)
            $scope.currentNode.loading = true;
            codefileResource.deleteByPath('scripts', $scope.currentNode.id).then(function () {
                $scope.currentNode.loading = false;
                //get the root node before we remove it
                var rootNode = treeService.getTreeRoot($scope.currentNode);
                //TODO: Need to sync tree, etc...
                treeService.removeNode($scope.currentNode);
                navigationService.hideMenu();
            });
        };
        $scope.cancel = function () {
            navigationService.hideDialog();
        };
    }
    angular.module('umbraco').controller('Umbraco.Editors.Scripts.DeleteController', ScriptsDeleteController);
    (function () {
        'use strict';
        function ScriptsEditController($scope, $routeParams, $timeout, appState, editorState, navigationService, assetsService, codefileResource, contentEditingHelper, notificationsService, localizationService, templateHelper, angularHelper) {
            var vm = this;
            var currentPosition = null;
            var localizeSaving = localizationService.localize('general_saving');
            vm.page = {};
            vm.page.loading = true;
            vm.page.menu = {};
            vm.page.menu.currentSection = appState.getSectionState('currentSection');
            vm.page.menu.currentNode = null;
            vm.page.saveButtonState = 'init';
            //Used to toggle the keyboard shortcut modal
            //From a custom keybinding in ace editor - that conflicts with our own to show the dialog
            vm.showKeyboardShortcut = false;
            //Keyboard shortcuts for help dialog
            vm.page.keyboardShortcutsOverview = [];
            vm.page.keyboardShortcutsOverview.push(templateHelper.getGeneralShortcuts());
            vm.page.keyboardShortcutsOverview.push(templateHelper.getEditorShortcuts());
            vm.script = {};
            // bind functions to view model
            vm.save = save;
            /* Function bound to view model */
            function save() {
                vm.page.saveButtonState = 'busy';
                vm.script.content = vm.editor.getValue();
                contentEditingHelper.contentEditorPerformSave({
                    statusMessage: localizeSaving,
                    saveMethod: codefileResource.save,
                    scope: $scope,
                    content: vm.script,
                    // We do not redirect on failure for scripts - this is because it is not possible to actually save the script
                    // when server side validation fails - as opposed to content where we are capable of saving the content
                    // item if server side validation fails
                    redirectOnFailure: false,
                    rebindCallback: function (orignal, saved) {
                    }
                }).then(function (saved) {
                    localizationService.localizeMany([
                        'speechBubbles_fileSavedHeader',
                        'speechBubbles_fileSavedText'
                    ]).then(function (data) {
                        var header = data[0];
                        var message = data[1];
                        notificationsService.success(header, message);
                    });
                    //check if the name changed, if so we need to redirect
                    if (vm.script.id !== saved.id) {
                        contentEditingHelper.redirectToRenamedContent(saved.id);
                    } else {
                        vm.page.saveButtonState = 'success';
                        vm.script = saved;
                        //sync state
                        editorState.set(vm.script);
                        // sync tree
                        navigationService.syncTree({
                            tree: 'scripts',
                            path: vm.script.path,
                            forceReload: true
                        }).then(function (syncArgs) {
                            vm.page.menu.currentNode = syncArgs.node;
                        });
                    }
                }, function (err) {
                    vm.page.saveButtonState = 'error';
                    localizationService.localizeMany([
                        'speechBubbles_validationFailedHeader',
                        'speechBubbles_validationFailedMessage'
                    ]).then(function (data) {
                        var header = data[0];
                        var message = data[1];
                        notificationsService.error(header, message);
                    });
                });
            }
            /* Local functions */
            function init() {
                //we need to load this somewhere, for now its here.
                assetsService.loadCss('lib/ace-razor-mode/theme/razor_chrome.css', $scope);
                if ($routeParams.create) {
                    codefileResource.getScaffold('scripts', $routeParams.id).then(function (script) {
                        ready(script, false);
                    });
                } else {
                    codefileResource.getByPath('scripts', $routeParams.id).then(function (script) {
                        ready(script, true);
                    });
                }
            }
            function ready(script, syncTree) {
                vm.page.loading = false;
                vm.script = script;
                //sync state
                editorState.set(vm.script);
                if (syncTree) {
                    navigationService.syncTree({
                        tree: 'scripts',
                        path: vm.script.path,
                        forceReload: true
                    }).then(function (syncArgs) {
                        vm.page.menu.currentNode = syncArgs.node;
                    });
                }
                vm.aceOption = {
                    mode: 'javascript',
                    theme: 'chrome',
                    showPrintMargin: false,
                    advanced: {
                        fontSize: '14px',
                        enableSnippets: true,
                        enableBasicAutocompletion: true,
                        enableLiveAutocompletion: false
                    },
                    onLoad: function (_editor) {
                        vm.editor = _editor;
                        //Update the auto-complete method to use ctrl+alt+space
                        _editor.commands.bindKey('ctrl-alt-space', 'startAutocomplete');
                        //Unassigns the keybinding (That was previously auto-complete)
                        //As conflicts with our own tree search shortcut
                        _editor.commands.bindKey('ctrl-space', null);
                        //TODO: Move all these keybinding config out into some helper/service
                        _editor.commands.addCommands([//Disable (alt+shift+K)
                            //Conflicts with our own show shortcuts dialog - this overrides it
                            {
                                name: 'unSelectOrFindPrevious',
                                bindKey: 'Alt-Shift-K',
                                exec: function () {
                                    //Toggle the show keyboard shortcuts overlay
                                    $scope.$apply(function () {
                                        vm.showKeyboardShortcut = !vm.showKeyboardShortcut;
                                    });
                                },
                                readOnly: true
                            }]);
                        // initial cursor placement
                        // Keep cursor in name field if we are create a new script
                        // else set the cursor at the bottom of the code editor
                        if (!$routeParams.create) {
                            $timeout(function () {
                                vm.editor.navigateFileEnd();
                                vm.editor.focus();
                            });
                        }
                        vm.editor.on('change', changeAceEditor);
                    }
                };
                function changeAceEditor() {
                    setFormState('dirty');
                }
                function setFormState(state) {
                    // get the current form
                    var currentForm = angularHelper.getCurrentForm($scope);
                    // set state
                    if (state === 'dirty') {
                        currentForm.$setDirty();
                    } else if (state === 'pristine') {
                        currentForm.$setPristine();
                    }
                }
            }
            init();
        }
        angular.module('umbraco').controller('Umbraco.Editors.Scripts.EditController', ScriptsEditController);
    }());
    /**
 * @ngdoc controller
 * @name Umbraco.Editors.Templates.DeleteController
 * @function
 *
 * @description
 * The controller for the template delete dialog
 */
    function TemplatesDeleteController($scope, templateResource, treeService, navigationService) {
        $scope.performDelete = function () {
            //mark it for deletion (used in the UI)
            $scope.currentNode.loading = true;
            // Reset the error message
            $scope.error = null;
            templateResource.deleteById($scope.currentNode.id).then(function () {
                $scope.currentNode.loading = false;
                //get the root node before we remove it
                var rootNode = treeService.getTreeRoot($scope.currentNode);
                //TODO: Need to sync tree, etc...
                treeService.removeNode($scope.currentNode);
                navigationService.hideMenu();
            }, function (err) {
                $scope.currentNode.loading = false;
                $scope.error = err;
            });
        };
        $scope.cancel = function () {
            navigationService.hideDialog();
        };
    }
    angular.module('umbraco').controller('Umbraco.Editors.Templates.DeleteController', TemplatesDeleteController);
    (function () {
        'use strict';
        function TemplatesEditController($scope, $routeParams, $timeout, templateResource, assetsService, notificationsService, editorState, navigationService, appState, macroService, treeService, contentEditingHelper, localizationService, angularHelper, templateHelper) {
            var vm = this;
            var oldMasterTemplateAlias = null;
            var localizeSaving = localizationService.localize('general_saving');
            vm.page = {};
            vm.page.loading = true;
            vm.templates = [];
            //menu
            vm.page.menu = {};
            vm.page.menu.currentSection = appState.getSectionState('currentSection');
            vm.page.menu.currentNode = null;
            //Used to toggle the keyboard shortcut modal
            //From a custom keybinding in ace editor - that conflicts with our own to show the dialog
            vm.showKeyboardShortcut = false;
            //Keyboard shortcuts for help dialog
            vm.page.keyboardShortcutsOverview = [];
            vm.page.keyboardShortcutsOverview.push(templateHelper.getGeneralShortcuts());
            vm.page.keyboardShortcutsOverview.push(templateHelper.getEditorShortcuts());
            vm.page.keyboardShortcutsOverview.push(templateHelper.getTemplateEditorShortcuts());
            vm.save = function (suppressNotification) {
                vm.page.saveButtonState = 'busy';
                vm.template.content = vm.editor.getValue();
                contentEditingHelper.contentEditorPerformSave({
                    statusMessage: localizeSaving,
                    saveMethod: templateResource.save,
                    scope: $scope,
                    content: vm.template,
                    //We do not redirect on failure for templates - this is because it is not possible to actually save the template
                    // type when server side validation fails - as opposed to content where we are capable of saving the content
                    // item if server side validation fails
                    redirectOnFailure: false,
                    rebindCallback: function (orignal, saved) {
                    }
                }).then(function (saved) {
                    if (!suppressNotification) {
                        localizationService.localizeMany([
                            'speechBubbles_templateSavedHeader',
                            'speechBubbles_templateSavedText'
                        ]).then(function (data) {
                            var header = data[0];
                            var message = data[1];
                            notificationsService.success(header, message);
                        });
                    }
                    vm.page.saveButtonState = 'success';
                    vm.template = saved;
                    //sync state
                    editorState.set(vm.template);
                    // sync tree
                    // if master template alias has changed move the node to it's new location
                    if (oldMasterTemplateAlias !== vm.template.masterTemplateAlias) {
                        // When creating a new template the id is -1. Make sure We don't remove the root node.
                        if (vm.page.menu.currentNode.id !== '-1') {
                            // move node to new location in tree
                            //first we need to remove the node that we're working on
                            treeService.removeNode(vm.page.menu.currentNode);
                        }
                        // update stored alias to the new one so the node won't move again unless the alias is changed again
                        oldMasterTemplateAlias = vm.template.masterTemplateAlias;
                        navigationService.syncTree({
                            tree: 'templates',
                            path: vm.template.path,
                            forceReload: true,
                            activate: true
                        }).then(function (args) {
                            vm.page.menu.currentNode = args.node;
                        });
                    } else {
                        // normal tree sync
                        navigationService.syncTree({
                            tree: 'templates',
                            path: vm.template.path,
                            forceReload: true
                        }).then(function (syncArgs) {
                            vm.page.menu.currentNode = syncArgs.node;
                        });
                    }
                    // clear $dirty state on form
                    setFormState('pristine');
                }, function (err) {
                    if (suppressNotification) {
                        vm.page.saveButtonState = 'error';
                        localizationService.localizeMany([
                            'speechBubbles_validationFailedHeader',
                            'speechBubbles_validationFailedMessage'
                        ]).then(function (data) {
                            var header = data[0];
                            var message = data[1];
                            notificationsService.error(header, message);
                        });
                    }
                });
            };
            vm.init = function () {
                //we need to load this somewhere, for now its here.
                assetsService.loadCss('lib/ace-razor-mode/theme/razor_chrome.css', $scope);
                //load templates - used in the master template picker
                templateResource.getAll().then(function (templates) {
                    vm.templates = templates;
                });
                if ($routeParams.create) {
                    templateResource.getScaffold($routeParams.id).then(function (template) {
                        vm.ready(template);
                    });
                } else {
                    templateResource.getById($routeParams.id).then(function (template) {
                        vm.ready(template);
                    });
                }
            };
            vm.ready = function (template) {
                vm.page.loading = false;
                vm.template = template;
                // if this is a new template, bind to the blur event on the name
                if ($routeParams.create) {
                    $timeout(function () {
                        var nameField = angular.element(document.querySelector('[data-element="editor-name-field"]'));
                        if (nameField) {
                            nameField.bind('blur', function (event) {
                                if (event.target.value) {
                                    vm.save(true);
                                }
                            });
                        }
                    });
                }
                //sync state
                editorState.set(vm.template);
                navigationService.syncTree({
                    tree: 'templates',
                    path: vm.template.path,
                    forceReload: true
                }).then(function (syncArgs) {
                    vm.page.menu.currentNode = syncArgs.node;
                });
                // save state of master template to use for comparison when syncing the tree on save
                oldMasterTemplateAlias = angular.copy(template.masterTemplateAlias);
                // ace configuration
                vm.aceOption = {
                    mode: 'razor',
                    theme: 'chrome',
                    showPrintMargin: false,
                    advanced: {
                        fontSize: '14px',
                        enableSnippets: false,
                        //The Razor mode snippets are awful (Need a way to override these)
                        enableBasicAutocompletion: true,
                        enableLiveAutocompletion: false
                    },
                    onLoad: function (_editor) {
                        vm.editor = _editor;
                        //Update the auto-complete method to use ctrl+alt+space
                        _editor.commands.bindKey('ctrl-alt-space', 'startAutocomplete');
                        //Unassigns the keybinding (That was previously auto-complete)
                        //As conflicts with our own tree search shortcut
                        _editor.commands.bindKey('ctrl-space', null);
                        // Assign new keybinding
                        _editor.commands.addCommands([
                            //Disable (alt+shift+K)
                            //Conflicts with our own show shortcuts dialog - this overrides it
                            {
                                name: 'unSelectOrFindPrevious',
                                bindKey: 'Alt-Shift-K',
                                exec: function () {
                                    //Toggle the show keyboard shortcuts overlay
                                    $scope.$apply(function () {
                                        vm.showKeyboardShortcut = !vm.showKeyboardShortcut;
                                    });
                                },
                                readOnly: true
                            },
                            {
                                name: 'insertUmbracoValue',
                                bindKey: 'Alt-Shift-V',
                                exec: function () {
                                    $scope.$apply(function () {
                                        openPageFieldOverlay();
                                    });
                                },
                                readOnly: true
                            },
                            {
                                name: 'insertPartialView',
                                bindKey: 'Alt-Shift-P',
                                exec: function () {
                                    $scope.$apply(function () {
                                        openPartialOverlay();
                                    });
                                },
                                readOnly: true
                            },
                            {
                                name: 'insertDictionary',
                                bindKey: 'Alt-Shift-D',
                                exec: function () {
                                    $scope.$apply(function () {
                                        openDictionaryItemOverlay();
                                    });
                                },
                                readOnly: true
                            },
                            {
                                name: 'insertUmbracoMacro',
                                bindKey: 'Alt-Shift-M',
                                exec: function () {
                                    $scope.$apply(function () {
                                        openMacroOverlay();
                                    });
                                },
                                readOnly: true
                            },
                            {
                                name: 'insertQuery',
                                bindKey: 'Alt-Shift-Q',
                                exec: function () {
                                    $scope.$apply(function () {
                                        openQueryBuilderOverlay();
                                    });
                                },
                                readOnly: true
                            },
                            {
                                name: 'insertSection',
                                bindKey: 'Alt-Shift-S',
                                exec: function () {
                                    $scope.$apply(function () {
                                        openSectionsOverlay();
                                    });
                                },
                                readOnly: true
                            },
                            {
                                name: 'chooseMasterTemplate',
                                bindKey: 'Alt-Shift-T',
                                exec: function () {
                                    $scope.$apply(function () {
                                        openMasterTemplateOverlay();
                                    });
                                },
                                readOnly: true
                            }
                        ]);
                        // initial cursor placement
                        // Keep cursor in name field if we are create a new template
                        // else set the cursor at the bottom of the code editor
                        if (!$routeParams.create) {
                            $timeout(function () {
                                vm.editor.navigateFileEnd();
                                vm.editor.focus();
                                persistCurrentLocation();
                            });
                        }
                        //change on blur, focus
                        vm.editor.on('blur', persistCurrentLocation);
                        vm.editor.on('focus', persistCurrentLocation);
                        vm.editor.on('change', changeAceEditor);
                    }
                };
            };
            vm.openPageFieldOverlay = openPageFieldOverlay;
            vm.openDictionaryItemOverlay = openDictionaryItemOverlay;
            vm.openQueryBuilderOverlay = openQueryBuilderOverlay;
            vm.openMacroOverlay = openMacroOverlay;
            vm.openInsertOverlay = openInsertOverlay;
            vm.openSectionsOverlay = openSectionsOverlay;
            vm.openPartialOverlay = openPartialOverlay;
            vm.openMasterTemplateOverlay = openMasterTemplateOverlay;
            vm.selectMasterTemplate = selectMasterTemplate;
            vm.getMasterTemplateName = getMasterTemplateName;
            vm.removeMasterTemplate = removeMasterTemplate;
            function openInsertOverlay() {
                vm.insertOverlay = {
                    view: 'insert',
                    allowedTypes: {
                        macro: true,
                        dictionary: true,
                        partial: true,
                        umbracoField: true
                    },
                    hideSubmitButton: true,
                    show: true,
                    submit: function (model) {
                        switch (model.insert.type) {
                        case 'macro':
                            var macroObject = macroService.collectValueData(model.insert.selectedMacro, model.insert.macroParams, 'Mvc');
                            insert(macroObject.syntax);
                            break;
                        case 'dictionary':
                            var code = templateHelper.getInsertDictionarySnippet(model.insert.node.name);
                            insert(code);
                            break;
                        case 'partial':
                            var code = templateHelper.getInsertPartialSnippet(model.insert.node.parentId, model.insert.node.name);
                            insert(code);
                            break;
                        case 'umbracoField':
                            insert(model.insert.umbracoField);
                            break;
                        }
                        vm.insertOverlay.show = false;
                        vm.insertOverlay = null;
                    },
                    close: function (oldModel) {
                        // close the dialog
                        vm.insertOverlay.show = false;
                        vm.insertOverlay = null;
                        // focus editor
                        vm.editor.focus();
                    }
                };
            }
            function openMacroOverlay() {
                vm.macroPickerOverlay = {
                    view: 'macropicker',
                    dialogData: {},
                    show: true,
                    title: localizationService.localize('template_insertMacro'),
                    submit: function (model) {
                        var macroObject = macroService.collectValueData(model.selectedMacro, model.macroParams, 'Mvc');
                        insert(macroObject.syntax);
                        vm.macroPickerOverlay.show = false;
                        vm.macroPickerOverlay = null;
                    },
                    close: function (oldModel) {
                        // close the dialog
                        vm.macroPickerOverlay.show = false;
                        vm.macroPickerOverlay = null;
                        // focus editor
                        vm.editor.focus();
                    }
                };
            }
            function openPageFieldOverlay() {
                vm.pageFieldOverlay = {
                    submitButtonLabel: 'Insert',
                    closeButtonlabel: 'Cancel',
                    view: 'insertfield',
                    show: true,
                    title: localizationService.localize('template_insertPageField'),
                    submit: function (model) {
                        insert(model.umbracoField);
                        vm.pageFieldOverlay.show = false;
                        vm.pageFieldOverlay = null;
                    },
                    close: function (model) {
                        // close the dialog
                        vm.pageFieldOverlay.show = false;
                        vm.pageFieldOverlay = null;
                        // focus editor
                        vm.editor.focus();
                    }
                };
            }
            function openDictionaryItemOverlay() {
                vm.dictionaryItemOverlay = {
                    view: 'treepicker',
                    section: 'settings',
                    treeAlias: 'dictionary',
                    entityType: 'dictionary',
                    multiPicker: false,
                    show: true,
                    title: localizationService.localize('template_insertDictionaryItem'),
                    emptyStateMessage: localizationService.localize('emptyStates_emptyDictionaryTree'),
                    select: function (node) {
                        var code = templateHelper.getInsertDictionarySnippet(node.name);
                        insert(code);
                        vm.dictionaryItemOverlay.show = false;
                        vm.dictionaryItemOverlay = null;
                    },
                    close: function (model) {
                        // close dialog
                        vm.dictionaryItemOverlay.show = false;
                        vm.dictionaryItemOverlay = null;
                        // focus editor
                        vm.editor.focus();
                    }
                };
            }
            function openPartialOverlay() {
                vm.partialItemOverlay = {
                    view: 'treepicker',
                    section: 'settings',
                    treeAlias: 'partialViews',
                    entityType: 'partialView',
                    multiPicker: false,
                    show: true,
                    title: localizationService.localize('template_insertPartialView'),
                    filter: function (i) {
                        if (i.name.indexOf('.cshtml') === -1 && i.name.indexOf('.vbhtml') === -1) {
                            return true;
                        }
                    },
                    filterCssClass: 'not-allowed',
                    select: function (node) {
                        var code = templateHelper.getInsertPartialSnippet(node.parentId, node.name);
                        insert(code);
                        vm.partialItemOverlay.show = false;
                        vm.partialItemOverlay = null;
                    },
                    close: function (model) {
                        // close dialog
                        vm.partialItemOverlay.show = false;
                        vm.partialItemOverlay = null;
                        // focus editor
                        vm.editor.focus();
                    }
                };
            }
            function openQueryBuilderOverlay() {
                vm.queryBuilderOverlay = {
                    view: 'querybuilder',
                    show: true,
                    title: localizationService.localize('template_queryBuilder'),
                    submit: function (model) {
                        var code = templateHelper.getQuerySnippet(model.result.queryExpression);
                        insert(code);
                        vm.queryBuilderOverlay.show = false;
                        vm.queryBuilderOverlay = null;
                    },
                    close: function (model) {
                        // close dialog
                        vm.queryBuilderOverlay.show = false;
                        vm.queryBuilderOverlay = null;
                        // focus editor
                        vm.editor.focus();
                    }
                };
            }
            function openSectionsOverlay() {
                vm.sectionsOverlay = {
                    view: 'templatesections',
                    isMaster: vm.template.isMasterTemplate,
                    submitButtonLabel: 'Insert',
                    show: true,
                    submit: function (model) {
                        if (model.insertType === 'renderBody') {
                            var code = templateHelper.getRenderBodySnippet();
                            insert(code);
                        }
                        if (model.insertType === 'renderSection') {
                            var code = templateHelper.getRenderSectionSnippet(model.renderSectionName, model.mandatoryRenderSection);
                            insert(code);
                        }
                        if (model.insertType === 'addSection') {
                            var code = templateHelper.getAddSectionSnippet(model.sectionName);
                            wrap(code);
                        }
                        vm.sectionsOverlay.show = false;
                        vm.sectionsOverlay = null;
                    },
                    close: function (model) {
                        // close dialog
                        vm.sectionsOverlay.show = false;
                        vm.sectionsOverlay = null;
                        // focus editor
                        vm.editor.focus();
                    }
                };
            }
            function openMasterTemplateOverlay() {
                // make collection of available master templates
                var availableMasterTemplates = [];
                // filter out the current template and the selected master template
                angular.forEach(vm.templates, function (template) {
                    if (template.alias !== vm.template.alias && template.alias !== vm.template.masterTemplateAlias) {
                        var templatePathArray = template.path.split(',');
                        // filter descendant templates of current template
                        if (templatePathArray.indexOf(String(vm.template.id)) === -1) {
                            availableMasterTemplates.push(template);
                        }
                    }
                });
                vm.masterTemplateOverlay = {
                    view: 'itempicker',
                    title: localizationService.localize('template_mastertemplate'),
                    availableItems: availableMasterTemplates,
                    show: true,
                    submit: function (model) {
                        var template = model.selectedItem;
                        if (template && template.alias) {
                            vm.template.masterTemplateAlias = template.alias;
                            setLayout(template.alias + '.cshtml');
                        } else {
                            vm.template.masterTemplateAlias = null;
                            setLayout(null);
                        }
                        vm.masterTemplateOverlay.show = false;
                        vm.masterTemplateOverlay = null;
                    },
                    close: function (oldModel) {
                        // close dialog
                        vm.masterTemplateOverlay.show = false;
                        vm.masterTemplateOverlay = null;
                        // focus editor
                        vm.editor.focus();
                    }
                };
            }
            function selectMasterTemplate(template) {
                if (template && template.alias) {
                    vm.template.masterTemplateAlias = template.alias;
                    setLayout(template.alias + '.cshtml');
                } else {
                    vm.template.masterTemplateAlias = null;
                    setLayout(null);
                }
            }
            function getMasterTemplateName(masterTemplateAlias, templates) {
                if (masterTemplateAlias) {
                    var templateName = '';
                    angular.forEach(templates, function (template) {
                        if (template.alias === masterTemplateAlias) {
                            templateName = template.name;
                        }
                    });
                    return templateName;
                }
            }
            function removeMasterTemplate() {
                vm.template.masterTemplateAlias = null;
                // call set layout with no paramters to set layout to null
                setLayout();
            }
            function setLayout(templatePath) {
                var templateCode = vm.editor.getValue();
                var newValue = templatePath;
                var layoutDefRegex = new RegExp('(@{[\\s\\S]*?Layout\\s*?=\\s*?)("[^"]*?"|null)(;[\\s\\S]*?})', 'gi');
                if (newValue !== undefined && newValue !== '') {
                    if (layoutDefRegex.test(templateCode)) {
                        // Declaration exists, so just update it
                        templateCode = templateCode.replace(layoutDefRegex, '$1"' + newValue + '"$3');
                    } else {
                        // Declaration doesn't exist, so prepend to start of doc
                        //TODO: Maybe insert at the cursor position, rather than just at the top of the doc?
                        templateCode = '@{\n\tLayout = "' + newValue + '";\n}\n' + templateCode;
                    }
                } else {
                    if (layoutDefRegex.test(templateCode)) {
                        // Declaration exists, so just update it
                        templateCode = templateCode.replace(layoutDefRegex, '$1null$3');
                    }
                }
                vm.editor.setValue(templateCode);
                vm.editor.clearSelection();
                vm.editor.navigateFileStart();
                vm.editor.focus();
                // set form state to $dirty
                setFormState('dirty');
            }
            function insert(str) {
                vm.editor.focus();
                vm.editor.moveCursorToPosition(vm.currentPosition);
                vm.editor.insert(str);
                // set form state to $dirty
                setFormState('dirty');
            }
            function wrap(str) {
                var selectedContent = vm.editor.session.getTextRange(vm.editor.getSelectionRange());
                str = str.replace('{0}', selectedContent);
                vm.editor.insert(str);
                vm.editor.focus();
                // set form state to $dirty
                setFormState('dirty');
            }
            function persistCurrentLocation() {
                vm.currentPosition = vm.editor.getCursorPosition();
            }
            function changeAceEditor() {
                setFormState('dirty');
            }
            function setFormState(state) {
                // get the current form
                var currentForm = angularHelper.getCurrentForm($scope);
                // set state
                if (state === 'dirty') {
                    currentForm.$setDirty();
                } else if (state === 'pristine') {
                    currentForm.$setPristine();
                }
            }
            vm.init();
        }
        angular.module('umbraco').controller('Umbraco.Editors.Templates.EditController', TemplatesEditController);
    }());
    (function () {
        'use strict';
        function UserGroupEditController($scope, $location, $routeParams, userGroupsResource, localizationService, contentEditingHelper) {
            var vm = this;
            var localizeSaving = localizationService.localize('general_saving');
            vm.page = {};
            vm.page.rootIcon = 'icon-folder';
            vm.userGroup = {};
            vm.labels = {};
            vm.goToPage = goToPage;
            vm.openSectionPicker = openSectionPicker;
            vm.openContentPicker = openContentPicker;
            vm.openMediaPicker = openMediaPicker;
            vm.openUserPicker = openUserPicker;
            vm.removeSelectedItem = removeSelectedItem;
            vm.clearStartNode = clearStartNode;
            vm.save = save;
            vm.openGranularPermissionsPicker = openGranularPermissionsPicker;
            vm.setPermissionsForNode = setPermissionsForNode;
            function init() {
                vm.loading = true;
                var labelKeys = [
                    'general_cancel',
                    'defaultdialogs_selectContentStartNode',
                    'defaultdialogs_selectMediaStartNode',
                    'defaultdialogs_selectNode',
                    'general_groups',
                    'content_contentRoot',
                    'media_mediaRoot'
                ];
                localizationService.localizeMany(labelKeys).then(function (values) {
                    vm.labels.cancel = values[0];
                    vm.labels.selectContentStartNode = values[1];
                    vm.labels.selectMediaStartNode = values[2];
                    vm.labels.selectNode = values[3];
                    vm.labels.groups = values[4];
                    vm.labels.contentRoot = values[5];
                    vm.labels.mediaRoot = values[6];
                });
                localizationService.localize('general_add').then(function (name) {
                    vm.labels.add = name;
                });
                localizationService.localize('user_noStartNode').then(function (name) {
                    vm.labels.noStartNode = name;
                });
                if ($routeParams.create) {
                    // get user group scaffold
                    userGroupsResource.getUserGroupScaffold().then(function (userGroup) {
                        vm.userGroup = userGroup;
                        setSectionIcon(vm.userGroup.sections);
                        makeBreadcrumbs();
                        vm.loading = false;
                    });
                } else {
                    // get user group
                    userGroupsResource.getUserGroup($routeParams.id).then(function (userGroup) {
                        vm.userGroup = userGroup;
                        formatGranularPermissionSelection();
                        setSectionIcon(vm.userGroup.sections);
                        makeBreadcrumbs();
                        vm.loading = false;
                    });
                }
            }
            function save() {
                vm.page.saveButtonState = 'busy';
                contentEditingHelper.contentEditorPerformSave({
                    statusMessage: localizeSaving,
                    saveMethod: userGroupsResource.saveUserGroup,
                    scope: $scope,
                    content: vm.userGroup,
                    // We do not redirect on failure for users - this is because it is not possible to actually save a user
                    // when server side validation fails - as opposed to content where we are capable of saving the content
                    // item if server side validation fails
                    redirectOnFailure: false,
                    rebindCallback: function (orignal, saved) {
                    }
                }).then(function (saved) {
                    vm.userGroup = saved;
                    formatGranularPermissionSelection();
                    setSectionIcon(vm.userGroup.sections);
                    makeBreadcrumbs();
                    vm.page.saveButtonState = 'success';
                }, function (err) {
                    vm.page.saveButtonState = 'error';
                });
            }
            function goToPage(ancestor) {
                $location.path(ancestor.path).search('subview', ancestor.subView);
            }
            function openSectionPicker() {
                vm.sectionPicker = {
                    view: 'sectionpicker',
                    selection: vm.userGroup.sections,
                    closeButtonLabel: vm.labels.cancel,
                    show: true,
                    submit: function (model) {
                        vm.sectionPicker.show = false;
                        vm.sectionPicker = null;
                    },
                    close: function (oldModel) {
                        if (oldModel.selection) {
                            vm.userGroup.sections = oldModel.selection;
                        }
                        vm.sectionPicker.show = false;
                        vm.sectionPicker = null;
                    }
                };
            }
            function openContentPicker() {
                vm.contentPicker = {
                    title: vm.labels.selectContentStartNode,
                    view: 'contentpicker',
                    hideSubmitButton: true,
                    hideHeader: false,
                    show: true,
                    submit: function (model) {
                        if (model.selection) {
                            vm.userGroup.contentStartNode = model.selection[0];
                            if (vm.userGroup.contentStartNode.id === '-1') {
                                vm.userGroup.contentStartNode.name = vm.labels.contentRoot;
                                vm.userGroup.contentStartNode.icon = 'icon-folder';
                            }
                        }
                        vm.contentPicker.show = false;
                        vm.contentPicker = null;
                    },
                    close: function (oldModel) {
                        vm.contentPicker.show = false;
                        vm.contentPicker = null;
                    }
                };
            }
            function openMediaPicker() {
                vm.contentPicker = {
                    title: vm.labels.selectMediaStartNode,
                    view: 'treepicker',
                    section: 'media',
                    treeAlias: 'media',
                    entityType: 'media',
                    hideSubmitButton: true,
                    hideHeader: false,
                    show: true,
                    submit: function (model) {
                        if (model.selection) {
                            vm.userGroup.mediaStartNode = model.selection[0];
                            if (vm.userGroup.mediaStartNode.id === '-1') {
                                vm.userGroup.mediaStartNode.name = vm.labels.mediaRoot;
                                vm.userGroup.mediaStartNode.icon = 'icon-folder';
                            }
                        }
                        vm.contentPicker.show = false;
                        vm.contentPicker = null;
                    },
                    close: function (oldModel) {
                        vm.contentPicker.show = false;
                        vm.contentPicker = null;
                    }
                };
            }
            function openUserPicker() {
                vm.userPicker = {
                    view: 'userpicker',
                    selection: vm.userGroup.users,
                    show: true,
                    submit: function (model) {
                        vm.userPicker.show = false;
                        vm.userPicker = null;
                    },
                    close: function (oldModel) {
                        vm.userPicker.show = false;
                        vm.userPicker = null;
                    }
                };
            }
            /**
         * The granular permissions structure gets returned from the server in the dictionary format with each key being the permission category
         * however the list to display the permissions isn't via the dictionary way so we need to format it
         */
            function formatGranularPermissionSelection() {
                angular.forEach(vm.userGroup.assignedPermissions, function (node) {
                    formatGranularPermissionSelectionForNode(node);
                });
            }
            function formatGranularPermissionSelectionForNode(node) {
                //the dictionary is assigned via node.permissions we will reformat to node.allowedPermissions
                node.allowedPermissions = [];
                angular.forEach(node.permissions, function (permissions, key) {
                    angular.forEach(permissions, function (p) {
                        if (p.checked) {
                            node.allowedPermissions.push(p);
                        }
                    });
                });
            }
            function openGranularPermissionsPicker() {
                vm.contentPicker = {
                    title: vm.labels.selectNode,
                    view: 'contentpicker',
                    hideSubmitButton: true,
                    show: true,
                    submit: function (model) {
                        if (model.selection) {
                            var node = model.selection[0];
                            //check if this is already in our selection
                            var found = _.find(vm.userGroup.assignedPermissions, function (i) {
                                return i.id === node.id;
                            });
                            node = found ? found : node;
                            setPermissionsForNode(node);
                        }
                    },
                    close: function (oldModel) {
                        vm.contentPicker.show = false;
                        vm.contentPicker = null;
                    }
                };
            }
            function setPermissionsForNode(node) {
                //clone the current defaults to pass to the model
                if (!node.permissions) {
                    node.permissions = angular.copy(vm.userGroup.defaultPermissions);
                }
                vm.nodePermissions = {
                    view: 'nodepermissions',
                    node: node,
                    show: true,
                    submit: function (model) {
                        if (model && model.node && model.node.permissions) {
                            formatGranularPermissionSelectionForNode(node);
                            if (!vm.userGroup.assignedPermissions) {
                                vm.userGroup.assignedPermissions = [];
                            }
                            //check if this is already in our selection
                            var found = _.find(vm.userGroup.assignedPermissions, function (i) {
                                return i.id === node.id;
                            });
                            if (!found) {
                                vm.userGroup.assignedPermissions.push(node);
                            }
                        }
                        // close node permisssions overlay
                        vm.nodePermissions.show = false;
                        vm.nodePermissions = null;
                        // close content picker overlay
                        if (vm.contentPicker) {
                            vm.contentPicker.show = false;
                            vm.contentPicker = null;
                        }
                    },
                    close: function (oldModel) {
                        vm.nodePermissions.show = false;
                        vm.nodePermissions = null;
                    }
                };
            }
            function removeSelectedItem(index, selection) {
                if (selection && selection.length > 0) {
                    selection.splice(index, 1);
                }
            }
            function clearStartNode(type) {
                if (type === 'content') {
                    vm.userGroup.contentStartNode = null;
                } else if (type === 'media') {
                    vm.userGroup.mediaStartNode = null;
                }
            }
            function makeBreadcrumbs() {
                vm.breadcrumbs = [
                    {
                        'name': vm.labels.groups,
                        'path': '/users/users/overview',
                        'subView': 'groups'
                    },
                    { 'name': vm.userGroup.name }
                ];
            }
            function setSectionIcon(sections) {
                angular.forEach(sections, function (section) {
                    section.icon = 'icon-section ' + section.cssclass;
                });
            }
            init();
        }
        angular.module('umbraco').controller('Umbraco.Editors.Users.GroupController', UserGroupEditController);
    }());
    (function () {
        'use strict';
        function UsersOverviewController($scope, $location, $timeout, navigationService, localizationService) {
            var vm = this;
            var usersUri = $location.search().subview;
            if (!usersUri) {
                $location.search('subview', 'users');
                //exit after this, we don't want to initialize anything further since this
                //is going to change the route
                return;
            }
            //note on the below, we dont assign a view unless it's the right route since if we did that it will load in that controller
            //for the view which is unecessary and will cause extra overhead/requests to occur
            vm.page = {};
            vm.page.name = localizationService.localize('user_userManagement');
            vm.page.navigation = [
                {
                    'name': localizationService.localize('sections_users'),
                    'icon': 'icon-user',
                    'action': function () {
                        $location.search('subview', 'users');
                    },
                    'view': !usersUri || usersUri === 'users' ? 'views/users/views/users/users.html' : null,
                    'active': !usersUri || usersUri === 'users'
                },
                {
                    'name': localizationService.localize('general_groups'),
                    'icon': 'icon-users',
                    'action': function () {
                        $location.search('subview', 'groups');
                    },
                    'view': usersUri === 'groups' ? 'views/users/views/groups/groups.html' : null,
                    'active': usersUri === 'groups'
                }
            ];
            function init() {
                $timeout(function () {
                    navigationService.syncTree({
                        tree: 'users',
                        path: '-1'
                    });
                });
            }
            init();
        }
        angular.module('umbraco').controller('Umbraco.Editors.Users.OverviewController', UsersOverviewController);
    }());
    (function () {
        'use strict';
        function UserEditController($scope, eventsService, $q, $timeout, $location, $routeParams, formHelper, usersResource, userService, contentEditingHelper, localizationService, notificationsService, mediaHelper, Upload, umbRequestHelper, usersHelper, authResource, dateHelper) {
            var vm = this;
            vm.page = {};
            vm.page.rootIcon = 'icon-folder';
            vm.user = { changePassword: null };
            vm.breadcrumbs = [];
            vm.avatarFile = {};
            vm.labels = {};
            vm.maxFileSize = Umbraco.Sys.ServerVariables.umbracoSettings.maxFileSize + 'KB';
            vm.acceptedFileTypes = mediaHelper.formatFileTypes(Umbraco.Sys.ServerVariables.umbracoSettings.imageFileTypes);
            vm.usernameIsEmail = Umbraco.Sys.ServerVariables.umbracoSettings.usernameIsEmail;
            //create the initial model for change password
            vm.changePasswordModel = {
                config: {},
                isChanging: false
            };
            vm.goToPage = goToPage;
            vm.openUserGroupPicker = openUserGroupPicker;
            vm.openContentPicker = openContentPicker;
            vm.openMediaPicker = openMediaPicker;
            vm.removeSelectedItem = removeSelectedItem;
            vm.disableUser = disableUser;
            vm.enableUser = enableUser;
            vm.unlockUser = unlockUser;
            vm.resendInvite = resendInvite;
            vm.deleteNonLoggedInUser = deleteNonLoggedInUser;
            vm.changeAvatar = changeAvatar;
            vm.clearAvatar = clearAvatar;
            vm.save = save;
            vm.toggleChangePassword = toggleChangePassword;
            function init() {
                vm.loading = true;
                var labelKeys = [
                    'general_saving',
                    'general_cancel',
                    'defaultdialogs_selectContentStartNode',
                    'defaultdialogs_selectMediaStartNode',
                    'sections_users',
                    'content_contentRoot',
                    'media_mediaRoot',
                    'user_noStartNodes',
                    'user_defaultInvitationMessage',
                    'user_deleteUserConfirmation'
                ];
                localizationService.localizeMany(labelKeys).then(function (values) {
                    vm.labels.saving = values[0];
                    vm.labels.cancel = values[1];
                    vm.labels.selectContentStartNode = values[2];
                    vm.labels.selectMediaStartNode = values[3];
                    vm.labels.users = values[4];
                    vm.labels.contentRoot = values[5];
                    vm.labels.mediaRoot = values[6];
                    vm.labels.noStartNodes = values[7];
                    vm.labels.defaultInvitationMessage = values[8];
                    vm.labels.deleteUserConfirmation = values[9];
                });
                // get user
                usersResource.getUser($routeParams.id).then(function (user) {
                    vm.user = user;
                    makeBreadcrumbs(vm.user);
                    setUserDisplayState();
                    formatDatesToLocal(vm.user);
                    vm.usernameIsEmail = Umbraco.Sys.ServerVariables.umbracoSettings.usernameIsEmail && user.email === user.username;
                    //go get the config for the membership provider and add it to the model
                    authResource.getMembershipProviderConfig().then(function (data) {
                        vm.changePasswordModel.config = data;
                        //the user has a password if they are not states: Invited, NoCredentials
                        vm.changePasswordModel.config.hasPassword = vm.user.userState !== 3 && vm.user.userState !== 4;
                        vm.changePasswordModel.config.disableToggle = true;
                        //this is only relavent for membership providers now (it's basically obsolete)
                        vm.changePasswordModel.config.enableReset = false;
                        //in the ASP.NET Identity world, this config option will allow an admin user to change another user's password
                        //if the user has access to the user section. So if this editor is being access, the user of course has access to this section.
                        //the authorization check is also done on the server side when submitted.
                        // only update the setting if not the current logged in user, otherwise leave the value as it is
                        // currently set in the web.config
                        if (!vm.user.isCurrentUser) {
                            vm.changePasswordModel.config.allowManuallyChangingPassword = true;
                        }
                        vm.loading = false;
                    });
                });
            }
            function getLocalDate(date, culture, format) {
                if (date) {
                    var dateVal;
                    var serverOffset = Umbraco.Sys.ServerVariables.application.serverTimeOffset;
                    var localOffset = new Date().getTimezoneOffset();
                    var serverTimeNeedsOffsetting = -serverOffset !== localOffset;
                    if (serverTimeNeedsOffsetting) {
                        dateVal = dateHelper.convertToLocalMomentTime(date, serverOffset);
                    } else {
                        dateVal = moment(date, 'YYYY-MM-DD HH:mm:ss');
                    }
                    return dateVal.locale(culture).format(format);
                }
            }
            function toggleChangePassword() {
                vm.changePasswordModel.isChanging = !vm.changePasswordModel.isChanging;
                //reset it
                vm.user.changePassword = null;
            }
            function save() {
                if (formHelper.submitForm({
                        scope: $scope,
                        statusMessage: vm.labels.saving
                    })) {
                    //anytime a user is changing another user's password, we are in effect resetting it so we need to set that flag here
                    if (vm.user.changePassword) {
                        //NOTE: the check for allowManuallyChangingPassword is due to this legacy user membership provider setting, if that is true, then the current user
                        //can change their own password without entering their current one (this is a legacy setting since that is a security issue but we need to maintain compat).
                        //if allowManuallyChangingPassword=false, then we are using default settings and the user will need to enter their old password to change their own password.
                        vm.user.changePassword.reset = !vm.user.changePassword.oldPassword && !vm.user.isCurrentUser || vm.changePasswordModel.config.allowManuallyChangingPassword;
                    }
                    vm.page.saveButtonState = 'busy';
                    vm.user.resetPasswordValue = null;
                    //save current nav to be restored later so that the tabs dont change
                    var currentNav = vm.user.navigation;
                    usersResource.saveUser(vm.user).then(function (saved) {
                        //if the user saved, then try to execute all extended save options
                        extendedSave(saved).then(function (result) {
                            //if all is good, then reset the form
                            formHelper.resetForm({
                                scope: $scope,
                                notifications: saved.notifications
                            });
                        }, function (err) {
                            //otherwise show the notifications for the user being saved
                            formHelper.showNotifications(saved);
                        });
                        vm.user = _.omit(saved, 'navigation');
                        //restore
                        vm.user.navigation = currentNav;
                        setUserDisplayState();
                        formatDatesToLocal(vm.user);
                        vm.changePasswordModel.isChanging = false;
                        //the user has a password if they are not states: Invited, NoCredentials
                        vm.changePasswordModel.config.hasPassword = vm.user.userState !== 3 && vm.user.userState !== 4;
                        vm.page.saveButtonState = 'success';
                    }, function (err) {
                        contentEditingHelper.handleSaveError({
                            redirectOnFailure: false,
                            err: err
                        });
                        //show any notifications
                        if (err.data) {
                            formHelper.showNotifications(err.data);
                        }
                        vm.page.saveButtonState = 'error';
                    });
                }
            }
            /**
         * Used to emit the save event and await any async operations being performed by editor extensions
         * @param {any} savedUser
         */
            function extendedSave(savedUser) {
                //used to track any promises added by the event handlers to be awaited
                var promises = [];
                var args = {
                    //getPromise: getPromise,
                    user: savedUser,
                    //a promise can be added by the event handler if the handler needs an async operation to be awaited
                    addPromise: function (p) {
                        promises.push(p);
                    }
                };
                //emit the event
                eventsService.emit('editors.user.editController.save', args);
                //await all promises to complete
                var resultPromise = $q.all(promises);
                return resultPromise;
            }
            function goToPage(ancestor) {
                $location.path(ancestor.path).search('subview', ancestor.subView);
            }
            function openUserGroupPicker() {
                vm.userGroupPicker = {
                    view: 'usergrouppicker',
                    selection: vm.user.userGroups,
                    closeButtonLabel: vm.labels.cancel,
                    show: true,
                    submit: function (model) {
                        // apply changes
                        if (model.selection) {
                            vm.user.userGroups = model.selection;
                        }
                        vm.userGroupPicker.show = false;
                        vm.userGroupPicker = null;
                    },
                    close: function (oldModel) {
                        // rollback on close
                        if (oldModel.selection) {
                            vm.user.userGroups = oldModel.selection;
                        }
                        vm.userGroupPicker.show = false;
                        vm.userGroupPicker = null;
                    }
                };
            }
            function openContentPicker() {
                vm.contentPicker = {
                    title: vm.labels.selectContentStartNode,
                    view: 'contentpicker',
                    multiPicker: true,
                    selection: vm.user.startContentIds,
                    hideHeader: false,
                    show: true,
                    submit: function (model) {
                        // select items
                        if (model.selection) {
                            angular.forEach(model.selection, function (item) {
                                if (item.id === '-1') {
                                    item.name = vm.labels.contentRoot;
                                    item.icon = 'icon-folder';
                                }
                                multiSelectItem(item, vm.user.startContentIds);
                            });
                        }
                        // close overlay
                        vm.contentPicker.show = false;
                        vm.contentPicker = null;
                    },
                    close: function (oldModel) {
                        // close overlay
                        vm.contentPicker.show = false;
                        vm.contentPicker = null;
                    }
                };
            }
            function openMediaPicker() {
                vm.mediaPicker = {
                    title: vm.labels.selectMediaStartNode,
                    view: 'treepicker',
                    section: 'media',
                    treeAlias: 'media',
                    entityType: 'media',
                    multiPicker: true,
                    hideHeader: false,
                    show: true,
                    submit: function (model) {
                        // select items
                        if (model.selection) {
                            angular.forEach(model.selection, function (item) {
                                if (item.id === '-1') {
                                    item.name = vm.labels.mediaRoot;
                                    item.icon = 'icon-folder';
                                }
                                multiSelectItem(item, vm.user.startMediaIds);
                            });
                        }
                        // close overlay
                        vm.mediaPicker.show = false;
                        vm.mediaPicker = null;
                    },
                    close: function (oldModel) {
                        // close overlay
                        vm.mediaPicker.show = false;
                        vm.mediaPicker = null;
                    }
                };
            }
            function multiSelectItem(item, selection) {
                var found = false;
                // check if item is already in the selected list
                if (selection.length > 0) {
                    angular.forEach(selection, function (selectedItem) {
                        if (selectedItem.udi === item.udi) {
                            found = true;
                        }
                    });
                }
                // only add the selected item if it is not already selected
                if (!found) {
                    selection.push(item);
                }
            }
            function removeSelectedItem(index, selection) {
                selection.splice(index, 1);
            }
            function disableUser() {
                vm.disableUserButtonState = 'busy';
                usersResource.disableUsers([vm.user.id]).then(function (data) {
                    vm.user.userState = 1;
                    setUserDisplayState();
                    vm.disableUserButtonState = 'success';
                    formHelper.showNotifications(data);
                }, function (error) {
                    vm.disableUserButtonState = 'error';
                    formHelper.showNotifications(error.data);
                });
            }
            function enableUser() {
                vm.enableUserButtonState = 'busy';
                usersResource.enableUsers([vm.user.id]).then(function (data) {
                    vm.user.userState = 0;
                    setUserDisplayState();
                    vm.enableUserButtonState = 'success';
                    formHelper.showNotifications(data);
                }, function (error) {
                    vm.enableUserButtonState = 'error';
                    formHelper.showNotifications(error.data);
                });
            }
            function unlockUser() {
                vm.unlockUserButtonState = 'busy';
                usersResource.unlockUsers([vm.user.id]).then(function (data) {
                    vm.user.userState = 0;
                    vm.user.failedPasswordAttempts = 0;
                    setUserDisplayState();
                    vm.unlockUserButtonState = 'success';
                    formHelper.showNotifications(data);
                }, function (error) {
                    vm.unlockUserButtonState = 'error';
                    formHelper.showNotifications(error.data);
                });
            }
            function resendInvite() {
                vm.resendInviteButtonState = 'busy';
                if (vm.resendInviteMessage) {
                    vm.user.message = vm.resendInviteMessage;
                } else {
                    vm.user.message = vm.labels.defaultInvitationMessage;
                }
                usersResource.inviteUser(vm.user).then(function (data) {
                    vm.resendInviteButtonState = 'success';
                    vm.resendInviteMessage = '';
                    formHelper.showNotifications(data);
                }, function (error) {
                    vm.resendInviteButtonState = 'error';
                    formHelper.showNotifications(error.data);
                });
            }
            function deleteNonLoggedInUser() {
                vm.deleteNotLoggedInUserButtonState = 'busy';
                var confirmationMessage = vm.labels.deleteUserConfirmation;
                if (!confirm(confirmationMessage)) {
                    vm.deleteNotLoggedInUserButtonState = 'danger';
                    return;
                }
                usersResource.deleteNonLoggedInUser(vm.user.id).then(function (data) {
                    formHelper.showNotifications(data);
                    goToPage(vm.breadcrumbs[0]);
                }, function (error) {
                    vm.deleteNotLoggedInUserButtonState = 'error';
                    formHelper.showNotifications(error.data);
                });
            }
            function clearAvatar() {
                // get user
                usersResource.clearAvatar(vm.user.id).then(function (data) {
                    vm.user.avatars = data;
                });
            }
            function changeAvatar(files, event) {
                if (files && files.length > 0) {
                    upload(files[0]);
                }
            }
            ;
            function upload(file) {
                vm.avatarFile.uploadProgress = 0;
                Upload.upload({
                    url: umbRequestHelper.getApiUrl('userApiBaseUrl', 'PostSetAvatar', { id: vm.user.id }),
                    fields: {},
                    file: file
                }).progress(function (evt) {
                    if (vm.avatarFile.uploadStatus !== 'done' && vm.avatarFile.uploadStatus !== 'error') {
                        // set uploading status on file
                        vm.avatarFile.uploadStatus = 'uploading';
                        // calculate progress in percentage
                        var progressPercentage = parseInt(100 * evt.loaded / evt.total, 10);
                        // set percentage property on file
                        vm.avatarFile.uploadProgress = progressPercentage;
                    }
                }).success(function (data, status, headers, config) {
                    // set done status on file
                    vm.avatarFile.uploadStatus = 'done';
                    vm.avatarFile.uploadProgress = 100;
                    vm.user.avatars = data;
                }).error(function (evt, status, headers, config) {
                    // set status done
                    vm.avatarFile.uploadStatus = 'error';
                    // If file not found, server will return a 404 and display this message
                    if (status === 404) {
                        vm.avatarFile.serverErrorMessage = 'File not found';
                    } else if (status == 400) {
                        //it's a validation error
                        vm.avatarFile.serverErrorMessage = evt.message;
                    } else {
                        //it's an unhandled error
                        //if the service returns a detailed error
                        if (evt.InnerException) {
                            vm.avatarFile.serverErrorMessage = evt.InnerException.ExceptionMessage;
                            //Check if its the common "too large file" exception
                            if (evt.InnerException.StackTrace && evt.InnerException.StackTrace.indexOf('ValidateRequestEntityLength') > 0) {
                                vm.avatarFile.serverErrorMessage = 'File too large to upload';
                            }
                        } else if (evt.Message) {
                            vm.avatarFile.serverErrorMessage = evt.Message;
                        }
                    }
                });
            }
            function makeBreadcrumbs() {
                vm.breadcrumbs = [
                    {
                        'name': vm.labels.users,
                        'path': '/users/users/overview',
                        'subView': 'users'
                    },
                    { 'name': vm.user.name }
                ];
            }
            function setUserDisplayState() {
                vm.user.userDisplayState = usersHelper.getUserStateFromValue(vm.user.userState);
            }
            function formatDatesToLocal(user) {
                // get current backoffice user and format dates
                userService.getCurrentUser().then(function (currentUser) {
                    user.formattedLastLogin = getLocalDate(user.lastLoginDate, currentUser.locale, 'LLL');
                    user.formattedLastLockoutDate = getLocalDate(user.lastLockoutDate, currentUser.locale, 'LLL');
                    user.formattedCreateDate = getLocalDate(user.createDate, currentUser.locale, 'LLL');
                    user.formattedUpdateDate = getLocalDate(user.updateDate, currentUser.locale, 'LLL');
                    user.formattedLastPasswordChangeDate = getLocalDate(user.lastPasswordChangeDate, currentUser.locale, 'LLL');
                });
            }
            init();
        }
        angular.module('umbraco').controller('Umbraco.Editors.Users.UserController', UserEditController);
    }());
    (function () {
        'use strict';
        function UserGroupsController($scope, $timeout, $location, userService, userGroupsResource, formHelper, localizationService) {
            var vm = this;
            vm.userGroups = [];
            vm.selection = [];
            vm.createUserGroup = createUserGroup;
            vm.clickUserGroup = clickUserGroup;
            vm.clearSelection = clearSelection;
            vm.selectUserGroup = selectUserGroup;
            vm.deleteUserGroups = deleteUserGroups;
            var currentUser = null;
            function onInit() {
                vm.loading = true;
                userService.getCurrentUser().then(function (user) {
                    currentUser = user;
                    // Get usergroups
                    userGroupsResource.getUserGroups({ onlyCurrentUserGroups: false }).then(function (userGroups) {
                        // only allow editing and selection if user is member of the group or admin
                        vm.userGroups = _.map(userGroups, function (ug) {
                            return {
                                group: ug,
                                hasAccess: user.userGroups.indexOf(ug.alias) !== -1 || user.userGroups.indexOf('admin') !== -1
                            };
                        });
                        vm.loading = false;
                    });
                });
            }
            function createUserGroup() {
                // clear all query params
                $location.search({});
                // go to create user group
                $location.path('users/users/group/-1').search('create', 'true');
                ;
            }
            function clickUserGroup(userGroup) {
                // only allow editing if user is member of the group or admin
                if (currentUser.userGroups.indexOf(userGroup.group.alias) === -1 && currentUser.userGroups.indexOf('admin') === -1) {
                    return;
                }
                if (vm.selection.length > 0) {
                    selectUserGroup(userGroup, vm.selection);
                } else {
                    goToUserGroup(userGroup.group.id);
                }
            }
            function selectUserGroup(userGroup, selection, event) {
                // Only allow selection if user is member of the group or admin
                if (currentUser.userGroups.indexOf(userGroup.group.alias) === -1 && currentUser.userGroups.indexOf('admin') === -1) {
                    return;
                }
                // Disallow selection of the admin/translators group, the checkbox is not visible in the UI, but clicking(and thus selecting) is still possible.
                // Currently selection can only be used for deleting, and the Controller will also disallow deleting the admin group.
                if (userGroup.group.alias === 'admin' || userGroup.group.alias === 'translator')
                    return;
                if (userGroup.selected) {
                    var index = selection.indexOf(userGroup.group.id);
                    selection.splice(index, 1);
                    userGroup.selected = false;
                } else {
                    userGroup.selected = true;
                    vm.selection.push(userGroup.group.id);
                }
                if (event) {
                    event.preventDefault();
                    event.stopPropagation();
                }
            }
            function deleteUserGroups() {
                if (vm.selection.length > 0) {
                    localizationService.localize('defaultdialogs_confirmdelete').then(function (value) {
                        var confirmResponse = confirm(value);
                        if (confirmResponse === true) {
                            userGroupsResource.deleteUserGroups(vm.selection).then(function (data) {
                                clearSelection();
                                onInit();
                                formHelper.showNotifications(data);
                            }, function (error) {
                                formHelper.showNotifications(error.data);
                            });
                        }
                    });
                }
            }
            function clearSelection() {
                angular.forEach(vm.userGroups, function (userGroup) {
                    userGroup.selected = false;
                });
                vm.selection = [];
            }
            function goToUserGroup(userGroupId) {
                $location.path('users/users/group/' + userGroupId).search('create', null);
            }
            onInit();
        }
        angular.module('umbraco').controller('Umbraco.Editors.Users.GroupsController', UserGroupsController);
    }());
    (function () {
        'use strict';
        function UsersController($scope, $timeout, $location, $routeParams, usersResource, userGroupsResource, userService, localizationService, contentEditingHelper, usersHelper, formHelper, notificationsService, dateHelper) {
            var vm = this;
            var localizeSaving = localizationService.localize('general_saving');
            vm.page = {};
            vm.users = [];
            vm.userGroups = [];
            vm.userStates = [];
            vm.selection = [];
            vm.newUser = {};
            vm.usersOptions = {};
            vm.userSortData = [
                {
                    label: 'Name (A-Z)',
                    key: 'Name',
                    direction: 'Ascending'
                },
                {
                    label: 'Name (Z-A)',
                    key: 'Name',
                    direction: 'Descending'
                },
                {
                    label: 'Newest',
                    key: 'CreateDate',
                    direction: 'Descending'
                },
                {
                    label: 'Oldest',
                    key: 'CreateDate',
                    direction: 'Ascending'
                },
                {
                    label: 'Last login',
                    key: 'LastLoginDate',
                    direction: 'Descending'
                }
            ];
            angular.forEach(vm.userSortData, function (userSortData) {
                var key = 'user_sort' + userSortData.key + userSortData.direction;
                localizationService.localize(key).then(function (value) {
                    var reg = /^\[[\S\s]*]$/g;
                    var result = reg.test(value);
                    if (result === false) {
                        // Only translate if key exists
                        userSortData.label = value;
                    }
                });
            });
            vm.userStatesFilter = [];
            vm.newUser.userGroups = [];
            vm.usersViewState = 'overview';
            vm.selectedBulkUserGroups = [];
            vm.usernameIsEmail = Umbraco.Sys.ServerVariables.umbracoSettings.usernameIsEmail;
            vm.allowDisableUser = true;
            vm.allowEnableUser = true;
            vm.allowUnlockUser = true;
            vm.allowSetUserGroup = true;
            vm.layouts = [
                {
                    'icon': 'icon-thumbnails-small',
                    'path': '1',
                    'selected': true
                },
                {
                    'icon': 'icon-list',
                    'path': '2',
                    'selected': true
                }
            ];
            vm.activeLayout = {
                'icon': 'icon-thumbnails-small',
                'path': '1',
                'selected': true
            };
            //don't show the invite button if no email is configured
            if (Umbraco.Sys.ServerVariables.umbracoSettings.showUserInvite) {
                vm.defaultButton = {
                    labelKey: 'user_inviteUser',
                    handler: function () {
                        vm.setUsersViewState('inviteUser');
                    }
                };
                vm.subButtons = [{
                        labelKey: 'user_createUser',
                        handler: function () {
                            vm.setUsersViewState('createUser');
                        }
                    }];
            } else {
                vm.defaultButton = {
                    labelKey: 'user_createUser',
                    handler: function () {
                        vm.setUsersViewState('createUser');
                    }
                };
            }
            vm.toggleFilter = toggleFilter;
            vm.setUsersViewState = setUsersViewState;
            vm.selectLayout = selectLayout;
            vm.selectUser = selectUser;
            vm.clearSelection = clearSelection;
            vm.clickUser = clickUser;
            vm.disableUsers = disableUsers;
            vm.enableUsers = enableUsers;
            vm.unlockUsers = unlockUsers;
            vm.openBulkUserGroupPicker = openBulkUserGroupPicker;
            vm.openUserGroupPicker = openUserGroupPicker;
            vm.removeSelectedUserGroup = removeSelectedUserGroup;
            vm.selectAll = selectAll;
            vm.areAllSelected = areAllSelected;
            vm.searchUsers = searchUsers;
            vm.getFilterName = getFilterName;
            vm.setUserStatesFilter = setUserStatesFilter;
            vm.setUserGroupFilter = setUserGroupFilter;
            vm.setOrderByFilter = setOrderByFilter;
            vm.changePageNumber = changePageNumber;
            vm.createUser = createUser;
            vm.inviteUser = inviteUser;
            vm.getSortLabel = getSortLabel;
            vm.toggleNewUserPassword = toggleNewUserPassword;
            vm.copySuccess = copySuccess;
            vm.copyError = copyError;
            vm.goToUser = goToUser;
            function init() {
                vm.usersOptions.orderBy = 'Name';
                vm.usersOptions.orderDirection = 'Ascending';
                if ($routeParams.create) {
                    setUsersViewState('createUser');
                } else if ($routeParams.invite) {
                    setUsersViewState('inviteUser');
                }
                // Get users
                getUsers();
                // Get user groups
                userGroupsResource.getUserGroups({ onlyCurrentUserGroups: false }).then(function (userGroups) {
                    vm.userGroups = userGroups;
                });
            }
            function getSortLabel(sortKey, sortDirection) {
                var found = _.find(vm.userSortData, function (i) {
                    return i.key === sortKey && i.direction === sortDirection;
                });
                return found ? found.label : sortKey;
            }
            function toggleFilter(type) {
                // hack: on-outside-click prevents us from closing the dropdown when clicking on another link
                // so I had to do this manually
                switch (type) {
                case 'state':
                    vm.page.showStatusFilter = !vm.page.showStatusFilter;
                    vm.page.showGroupFilter = false;
                    vm.page.showOrderByFilter = false;
                    break;
                case 'group':
                    vm.page.showGroupFilter = !vm.page.showGroupFilter;
                    vm.page.showStatusFilter = false;
                    vm.page.showOrderByFilter = false;
                    break;
                case 'orderBy':
                    vm.page.showOrderByFilter = !vm.page.showOrderByFilter;
                    vm.page.showStatusFilter = false;
                    vm.page.showGroupFilter = false;
                    break;
                }
            }
            function setUsersViewState(state) {
                if (state === 'createUser') {
                    clearAddUserForm();
                    $location.search('create', 'true');
                    $location.search('invite', null);
                } else if (state === 'inviteUser') {
                    $location.search('create', null);
                    $location.search('invite', 'true');
                } else if (state === 'overview') {
                    $location.search('create', null);
                    $location.search('invite', null);
                }
                vm.usersViewState = state;
            }
            function selectLayout(selectedLayout) {
                angular.forEach(vm.layouts, function (layout) {
                    layout.active = false;
                });
                selectedLayout.active = true;
                vm.activeLayout = selectedLayout;
            }
            function selectUser(user, selection, event) {
                // prevent the current user to be selected
                if (!user.isCurrentUser) {
                    if (user.selected) {
                        var index = selection.indexOf(user.id);
                        selection.splice(index, 1);
                        user.selected = false;
                    } else {
                        user.selected = true;
                        vm.selection.push(user.id);
                    }
                    setBulkActions(vm.users);
                    if (event) {
                        event.preventDefault();
                        event.stopPropagation();
                    }
                }
            }
            function clearSelection() {
                angular.forEach(vm.users, function (user) {
                    user.selected = false;
                });
                vm.selection = [];
            }
            function clickUser(user) {
                if (vm.selection.length > 0) {
                    selectUser(user, vm.selection);
                } else {
                    goToUser(user.id);
                }
            }
            function disableUsers() {
                vm.disableUserButtonState = 'busy';
                usersResource.disableUsers(vm.selection).then(function (data) {
                    // update userState
                    angular.forEach(vm.selection, function (userId) {
                        var user = getUserFromArrayById(userId, vm.users);
                        if (user) {
                            user.userState = 1;
                        }
                    });
                    // show the correct badges
                    setUserDisplayState(vm.users);
                    formHelper.showNotifications(data);
                    vm.disableUserButtonState = 'init';
                    clearSelection();
                }, function (error) {
                    vm.disableUserButtonState = 'error';
                    formHelper.showNotifications(error.data);
                });
            }
            function enableUsers() {
                vm.enableUserButtonState = 'busy';
                usersResource.enableUsers(vm.selection).then(function (data) {
                    // update userState
                    angular.forEach(vm.selection, function (userId) {
                        var user = getUserFromArrayById(userId, vm.users);
                        if (user) {
                            user.userState = 0;
                        }
                    });
                    // show the correct badges
                    setUserDisplayState(vm.users);
                    // show notification
                    formHelper.showNotifications(data);
                    vm.enableUserButtonState = 'init';
                    clearSelection();
                }, function (error) {
                    vm.enableUserButtonState = 'error';
                    formHelper.showNotifications(error.data);
                });
            }
            function unlockUsers() {
                vm.unlockUserButtonState = 'busy';
                usersResource.unlockUsers(vm.selection).then(function (data) {
                    // update userState
                    angular.forEach(vm.selection, function (userId) {
                        var user = getUserFromArrayById(userId, vm.users);
                        if (user) {
                            user.userState = 0;
                        }
                    });
                    // show the correct badges
                    setUserDisplayState(vm.users);
                    // show notification
                    formHelper.showNotifications(data);
                    vm.unlockUserButtonState = 'init';
                    clearSelection();
                }, function (error) {
                    vm.unlockUserButtonState = 'error';
                    formHelper.showNotifications(error.data);
                });
            }
            function getUserFromArrayById(userId, users) {
                return _.find(users, function (u) {
                    return u.id === userId;
                });
            }
            function openBulkUserGroupPicker(event) {
                var firstSelectedUser = getUserFromArrayById(vm.selection[0], vm.users);
                vm.selectedBulkUserGroups = _.clone(firstSelectedUser.userGroups);
                vm.userGroupPicker = {
                    title: localizationService.localize('user_selectUserGroups'),
                    view: 'usergrouppicker',
                    selection: vm.selectedBulkUserGroups,
                    closeButtonLabel: localizationService.localize('general_cancel'),
                    show: true,
                    submit: function (model) {
                        usersResource.setUserGroupsOnUsers(model.selection, vm.selection).then(function (data) {
                            // sorting to ensure they show up in right order when updating the UI
                            vm.selectedBulkUserGroups.sort(function (a, b) {
                                return a.alias > b.alias ? 1 : a.alias < b.alias ? -1 : 0;
                            });
                            // apply changes to UI
                            _.each(vm.selection, function (userId) {
                                var user = getUserFromArrayById(userId, vm.users);
                                user.userGroups = vm.selectedBulkUserGroups;
                            });
                            vm.selectedBulkUserGroups = [];
                            vm.userGroupPicker.show = false;
                            vm.userGroupPicker = null;
                            formHelper.showNotifications(data);
                            clearSelection();
                        }, function (error) {
                            formHelper.showNotifications(error.data);
                        });
                    },
                    close: function (oldModel) {
                        vm.selectedBulkUserGroups = [];
                        vm.userGroupPicker.show = false;
                        vm.userGroupPicker = null;
                    }
                };
            }
            function openUserGroupPicker(event) {
                vm.userGroupPicker = {
                    title: localizationService.localize('user_selectUserGroups'),
                    view: 'usergrouppicker',
                    selection: vm.newUser.userGroups,
                    closeButtonLabel: localizationService.localize('general_cancel'),
                    show: true,
                    submit: function (model) {
                        // apply changes
                        if (model.selection) {
                            vm.newUser.userGroups = model.selection;
                        }
                        vm.userGroupPicker.show = false;
                        vm.userGroupPicker = null;
                    },
                    close: function (oldModel) {
                        // rollback on close
                        if (oldModel.selection) {
                            vm.newUser.userGroups = oldModel.selection;
                        }
                        vm.userGroupPicker.show = false;
                        vm.userGroupPicker = null;
                    }
                };
            }
            function removeSelectedUserGroup(index, selection) {
                selection.splice(index, 1);
            }
            function selectAll() {
                if (areAllSelected()) {
                    vm.selection = [];
                    angular.forEach(vm.users, function (user) {
                        user.selected = false;
                    });
                } else {
                    // clear selection so we don't add the same user twice
                    vm.selection = [];
                    // select all users
                    angular.forEach(vm.users, function (user) {
                        // prevent the current user to be selected
                        if (!user.isCurrentUser) {
                            user.selected = true;
                            vm.selection.push(user.id);
                        }
                    });
                }
            }
            function areAllSelected() {
                // we need to check if the current user is part of the selection and 
                // subtract the user from the total selection to find out if all users are selected
                var includesCurrentUser = vm.users.some(function (user) {
                    return user.isCurrentUser === true;
                });
                if (includesCurrentUser) {
                    if (vm.selection.length === vm.users.length - 1) {
                        return true;
                    }
                } else {
                    if (vm.selection.length === vm.users.length) {
                        return true;
                    }
                }
            }
            var search = _.debounce(function () {
                $scope.$apply(function () {
                    getUsers();
                });
            }, 500);
            function searchUsers() {
                search();
            }
            function getFilterName(array) {
                var name = 'All';
                var found = false;
                angular.forEach(array, function (item) {
                    if (item.selected) {
                        if (!found) {
                            name = item.name;
                            found = true;
                        } else {
                            name = name + ', ' + item.name;
                        }
                    }
                });
                return name;
            }
            function setUserStatesFilter(userState) {
                if (!vm.usersOptions.userStates) {
                    vm.usersOptions.userStates = [];
                }
                //If the selection is "ALL" then we need to unselect everything else since this is an 'odd' filter
                if (userState.key === 'All') {
                    angular.forEach(vm.userStatesFilter, function (i) {
                        i.selected = false;
                    });
                    //we can't unselect All
                    userState.selected = true;
                    //reset the selection passed to the server
                    vm.usersOptions.userStates = [];
                } else {
                    angular.forEach(vm.userStatesFilter, function (i) {
                        if (i.key === 'All') {
                            i.selected = false;
                        }
                    });
                    var indexOfAll = vm.usersOptions.userStates.indexOf('All');
                    if (indexOfAll >= 0) {
                        vm.usersOptions.userStates.splice(indexOfAll, 1);
                    }
                }
                if (userState.selected) {
                    vm.usersOptions.userStates.push(userState.key);
                } else {
                    var index = vm.usersOptions.userStates.indexOf(userState.key);
                    vm.usersOptions.userStates.splice(index, 1);
                }
                getUsers();
            }
            function setUserGroupFilter(userGroup) {
                if (!vm.usersOptions.userGroups) {
                    vm.usersOptions.userGroups = [];
                }
                if (userGroup.selected) {
                    vm.usersOptions.userGroups.push(userGroup.alias);
                } else {
                    var index = vm.usersOptions.userGroups.indexOf(userGroup.alias);
                    vm.usersOptions.userGroups.splice(index, 1);
                }
                getUsers();
            }
            function setOrderByFilter(value, direction) {
                vm.usersOptions.orderBy = value;
                vm.usersOptions.orderDirection = direction;
                getUsers();
            }
            function changePageNumber(pageNumber) {
                vm.usersOptions.pageNumber = pageNumber;
                getUsers();
            }
            function createUser(addUserForm) {
                if (formHelper.submitForm({
                        formCtrl: addUserForm,
                        scope: $scope,
                        statusMessage: 'Saving...'
                    })) {
                    vm.newUser.id = -1;
                    vm.newUser.parentId = -1;
                    vm.page.createButtonState = 'busy';
                    usersResource.createUser(vm.newUser).then(function (saved) {
                        vm.page.createButtonState = 'success';
                        vm.newUser = saved;
                        setUsersViewState('createUserSuccess');
                        getUsers();
                    }, function (err) {
                        formHelper.handleError(err);
                        vm.page.createButtonState = 'error';
                    });
                }
            }
            function inviteUser(addUserForm) {
                if (formHelper.submitForm({
                        formCtrl: addUserForm,
                        scope: $scope,
                        statusMessage: 'Saving...'
                    })) {
                    vm.newUser.id = -1;
                    vm.newUser.parentId = -1;
                    vm.page.createButtonState = 'busy';
                    usersResource.inviteUser(vm.newUser).then(function (saved) {
                        //success
                        vm.page.createButtonState = 'success';
                        vm.newUser = saved;
                        setUsersViewState('inviteUserSuccess');
                        getUsers();
                    }, function (err) {
                        //error
                        formHelper.handleError(err);
                        vm.page.createButtonState = 'error';
                    });
                }
            }
            function toggleNewUserPassword() {
                vm.newUser.showPassword = !vm.newUser.showPassword;
            }
            // copy to clip board success
            function copySuccess() {
                vm.page.copyPasswordButtonState = 'success';
            }
            // copy to clip board error
            function copyError() {
                vm.page.copyPasswordButtonState = 'error';
            }
            function goToUser(userId) {
                $location.path('users/users/user/' + userId);
            }
            // helpers
            function getUsers() {
                vm.loading = true;
                // Get users
                usersResource.getPagedResults(vm.usersOptions).then(function (data) {
                    vm.users = data.items;
                    vm.usersOptions.pageNumber = data.pageNumber;
                    vm.usersOptions.pageSize = data.pageSize;
                    vm.usersOptions.totalItems = data.totalItems;
                    vm.usersOptions.totalPages = data.totalPages;
                    formatDates(vm.users);
                    setUserDisplayState(vm.users);
                    vm.userStatesFilter = usersHelper.getUserStatesFilter(data.userStates);
                    vm.loading = false;
                }, function (error) {
                    vm.loading = false;
                });
            }
            function setUserDisplayState(users) {
                angular.forEach(users, function (user) {
                    user.userDisplayState = usersHelper.getUserStateFromValue(user.userState);
                });
            }
            function formatDates(users) {
                angular.forEach(users, function (user) {
                    if (user.lastLoginDate) {
                        var dateVal;
                        var serverOffset = Umbraco.Sys.ServerVariables.application.serverTimeOffset;
                        var localOffset = new Date().getTimezoneOffset();
                        var serverTimeNeedsOffsetting = -serverOffset !== localOffset;
                        if (serverTimeNeedsOffsetting) {
                            dateVal = dateHelper.convertToLocalMomentTime(user.lastLoginDate, serverOffset);
                        } else {
                            dateVal = moment(user.lastLoginDate, 'YYYY-MM-DD HH:mm:ss');
                        }
                        // get current backoffice user and format date
                        userService.getCurrentUser().then(function (currentUser) {
                            user.formattedLastLogin = dateVal.locale(currentUser.locale).format('LLL');
                        });
                    }
                });
            }
            function setBulkActions(users) {
                // reset all states
                vm.allowDisableUser = true;
                vm.allowEnableUser = true;
                vm.allowUnlockUser = true;
                vm.allowSetUserGroup = true;
                var firstSelectedUserGroups;
                angular.forEach(users, function (user) {
                    if (!user.selected) {
                        return;
                    }
                    // if the current user is selected prevent any bulk actions with the user included
                    if (user.isCurrentUser) {
                        vm.allowDisableUser = false;
                        vm.allowEnableUser = false;
                        vm.allowUnlockUser = false;
                        vm.allowSetUserGroup = false;
                        return;
                    }
                    if (user.userDisplayState && user.userDisplayState.key === 'Disabled') {
                        vm.allowDisableUser = false;
                    }
                    if (user.userDisplayState && user.userDisplayState.key === 'Active') {
                        vm.allowEnableUser = false;
                    }
                    if (user.userDisplayState && user.userDisplayState.key === 'Invited') {
                        vm.allowEnableUser = false;
                    }
                    if (user.userDisplayState && user.userDisplayState.key === 'LockedOut') {
                        vm.allowEnableUser = false;
                    }
                    if (user.userDisplayState && user.userDisplayState.key !== 'LockedOut') {
                        vm.allowUnlockUser = false;
                    }
                    // store the user group aliases of the first selected user
                    if (!firstSelectedUserGroups) {
                        firstSelectedUserGroups = user.userGroups.map(function (ug) {
                            return ug.alias;
                        });
                        vm.allowSetUserGroup = true;
                    } else if (vm.allowSetUserGroup === true) {
                        // for 2nd+ selected user, compare the user group aliases to determine if we should allow bulk editing.
                        // we don't allow bulk editing of users not currently having the same assigned user groups, as we can't
                        // really support that in the user group picker.
                        var userGroups = user.userGroups.map(function (ug) {
                            return ug.alias;
                        });
                        if (_.difference(firstSelectedUserGroups, userGroups).length > 0) {
                            vm.allowSetUserGroup = false;
                        }
                    }
                });
            }
            function clearAddUserForm() {
                // clear form data
                vm.newUser.name = '';
                vm.newUser.email = '';
                vm.newUser.userGroups = [];
                vm.newUser.message = '';
                // clear button state
                vm.page.createButtonState = 'init';
            }
            init();
        }
        angular.module('umbraco').controller('Umbraco.Editors.Users.UsersController', UsersController);
    }());
}());