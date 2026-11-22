import type { InterfaceLocale } from "@/lib/interface-locale";

export const PRIVACY_CONTACT = "2354628216wzb@gmail.com";
export const PRIVACY_UPDATED = "2026-11-04";

type LegalCopy = {
    privacy: string;
    terms: string;
    home: string;
    updated: string;
    contact: string;
    loading: string;
    unavailable: string;
    empty: string;
    retry: string;
    intro: string;
    sections: readonly { title: string; body: string }[];
};

const simplified: LegalCopy = {
    privacy: "隐私政策", terms: "服务条款", home: "返回首页", updated: "更新日期", contact: "联系我们",
    loading: "正在读取服务条款…", unavailable: "暂时无法读取服务条款，请重试。", empty: "服务条款尚未公布。", retry: "重试",
    intro: "本政策说明映雪平台运营者在提供账号、AI 创作、素材存储及充值服务时如何处理您的信息，适用于本网站及其提供的相关功能。",
    sections: [
        { title: "一、账号与 Google 登录", body: "注册及账号管理涉及您提交的账号名称、联系方式和个人资料。使用 Google 登录时，我们仅申请 openid、email、profile 权限，读取 Google 账号标识、已验证邮箱、名称及头像，用于身份验证、创建和识别平台账号及展示个人资料。我们不会获取您的 Google 密码、Gmail 邮件或 Google 云端硬盘文件。Google 账号数据不用于广告定向、出售或训练通用 AI 模型。" },
        { title: "二、创作、订单与运行信息", body: "提供相应功能时，我们处理您提交的提示词、对话、项目、画布、上传及生成的图片、音视频和其他文件，以及任务状态、积分消费和充值订单记录。为维持登录、保障安全和排查故障，还会处理必要的 IP 地址、访问与错误日志、浏览器及设备信息。请仅提交具有合法使用权的资料。" },
        { title: "三、第三方服务与跨境处理", body: "您使用生成、验证、支付、存储或分享功能时，必要的信息可能交由对应的模型、身份验证、支付、云存储或内容分发服务提供者处理；创作输入可能发送到所选模型服务，公开分享的内容可由访问者查看。部分服务及基础设施可能位于您所在国家或地区之外。我们仅为提供所选功能、安全保障或履行法律义务进行必要处理，不出售您的个人信息。第三方同时适用其自身隐私政策。" },
        { title: "四、Cookies 与本地缓存", body: "网站使用必要的登录 Cookie，并在浏览器中保存语言、主题、创作缓存等设置或数据。您可以通过退出登录、清理站点数据或浏览器设置进行管理；清理数据可能使您退出登录，并移除尚未同步的本地创作。" },
        { title: "五、保存与保护", body: "我们在提供服务所需的期限内保存相关信息，并采用 HTTPS、访问权限控制等措施保护数据。您删除内容或申请注销后，将依据业务引用、备份周期及适用法律处理相关数据；依法需保留的交易、安全及争议处理记录可能继续保留。网络服务无法保证绝对安全，请妥善保管登录凭据。" },
        { title: "六、您的选择与权利", body: "您可以在已有账号设置中查看或修改个人资料，并联系我们申请访问、更正、导出、删除数据或注销账号；我们会在核验身份后依据适用规则处理。您也可以在 Google 账号的第三方连接管理中撤销授权。撤销 Google 授权不会自动删除映雪账号或已保存的创作，删除申请请另行联系。" },
        { title: "七、政策更新与联系", body: "政策变更会在本页公布并更新日期；如处理目的或方式发生重大变化，将按适用要求另行告知。有关隐私、账号注销或数据处理的问题，请通过下方邮箱联系映雪平台运营者。" },
    ],
};

const traditional: LegalCopy = {
    privacy: "隱私政策", terms: "服務條款", home: "返回首頁", updated: "更新日期", contact: "聯絡我們",
    loading: "正在讀取服務條款…", unavailable: "暫時無法讀取服務條款，請重試。", empty: "服務條款尚未公布。", retry: "重試",
    intro: "本政策說明映雪平台營運者在提供帳號、AI 創作、素材儲存及充值服務時如何處理您的資訊，適用於本網站及其提供的相關功能。",
    sections: [
        { title: "一、帳號與 Google 登入", body: "註冊及帳號管理涉及您提交的帳號名稱、聯絡方式和個人資料。使用 Google 登入時，我們僅申請 openid、email、profile 權限，讀取 Google 帳號識別碼、已驗證電郵、名稱及頭像，用於身分驗證、建立和識別平台帳號及顯示個人資料。我們不會取得您的 Google 密碼、Gmail 郵件或 Google 雲端硬碟檔案。Google 帳號資料不會用於廣告定向、出售或訓練通用 AI 模型。" },
        { title: "二、創作、訂單與運行資訊", body: "提供相應功能時，我們處理您提交的提示詞、對話、專案、畫布、上傳及生成的圖片、影音和其他檔案，以及任務狀態、積分消費和充值訂單紀錄。為維持登入、保障安全和排查故障，亦會處理必要的 IP 位址、存取與錯誤紀錄、瀏覽器及裝置資訊。請僅提交具有合法使用權的資料。" },
        { title: "三、第三方服務與跨境處理", body: "您使用生成、驗證、支付、儲存或分享功能時，必要資訊可能交由相應的模型、身分驗證、支付、雲端儲存或內容分發服務商處理；創作輸入可能傳送至所選模型服務，公開分享的內容可由訪客查看。部分服務及基礎設施可能位於您所在國家或地區以外。我們僅為提供所選功能、安全保障或履行法律義務進行必要處理，不出售您的個人資訊。第三方同時適用其本身的隱私政策。" },
        { title: "四、Cookies 與本機快取", body: "網站使用必要的登入 Cookie，並在瀏覽器儲存語言、主題、創作快取等設定或資料。您可透過登出、清除網站資料或瀏覽器設定管理；清除資料可能使您登出，並移除尚未同步的本機創作。" },
        { title: "五、保存與保護", body: "我們在提供服務所需的期間保存相關資訊，並採用 HTTPS、存取權限控制等措施保護資料。刪除內容或申請註銷後，將依業務引用、備份週期及適用法律處理；依法須保留的交易、安全及爭議處理紀錄可能繼續保留。網絡服務無法保證絕對安全，請妥善保管登入憑據。" },
        { title: "六、您的選擇與權利", body: "您可在現有帳號設定查看或修改個人資料，並聯絡我們申請存取、更正、匯出、刪除資料或註銷帳號；我們會核實身分後依適用規則處理。您亦可在 Google 帳號的第三方連線管理中撤銷授權。撤銷 Google 授權不會自動刪除映雪帳號或已儲存的創作，刪除申請請另行聯絡。" },
        { title: "七、政策更新與聯絡", body: "政策變更會於本頁公布並更新日期；如處理目的或方式有重大變化，將按適用要求另行通知。有關隱私、帳號註銷或資料處理的問題，請透過下方電郵聯絡映雪平台營運者。" },
    ],
};

const english: LegalCopy = {
    privacy: "Privacy Policy", terms: "Terms of Service", home: "Back to home", updated: "Updated", contact: "Contact us",
    loading: "Loading terms…", unavailable: "The terms could not be loaded. Please retry.", empty: "The terms have not been published.", retry: "Retry",
    intro: "This policy explains how the operator of Yingxue handles information when providing accounts, AI creation, file storage and top-up services on this website.",
    sections: [
        { title: "1. Accounts and Google sign-in", body: "Account registration and management involve the username, contact details and profile you submit. Google sign-in requests only openid, email and profile scopes. We receive your Google account identifier, verified email, name and picture to authenticate you, create or identify your platform account and display your profile. We do not receive your Google password, Gmail messages or Google Drive files. Google account data is not used for targeted advertising, sale or training general-purpose AI models." },
        { title: "2. Creative, transaction and technical data", body: "Relevant features process your prompts, conversations, projects, canvases, uploaded and generated images, audio, video and other files, together with task status, credit usage and top-up records. Necessary IP addresses, access and error logs, browser and device information support sign-in, security and troubleshooting. Submit only material you are entitled to use." },
        { title: "3. Service providers and international processing", body: "Generation, verification, payment, storage and sharing features may send necessary information to the corresponding model, identity, payment, cloud storage or content delivery providers. Creative inputs may be sent to your selected model service; visitors can view content you choose to share publicly. Some providers or infrastructure may be outside your country or region. We process information as needed for selected features, security or legal obligations and do not sell personal information. Providers also apply their own privacy policies." },
        { title: "4. Cookies and local storage", body: "The website uses necessary sign-in cookies and browser storage for language, theme, creative caches and other preferences or data. You can manage these through sign-out, site-data deletion or browser settings. Clearing site data may sign you out and remove creative work that has not yet synchronized." },
        { title: "5. Retention and protection", body: "We retain information for the period needed to provide the services and use measures including HTTPS and access controls. Content deletion and account-closure requests are handled with regard to business references, backup cycles and applicable law. Transaction, security or dispute records may be retained where required. No online service can guarantee absolute security; protect your sign-in credentials." },
        { title: "6. Your choices and rights", body: "You can view or change profile details through available account settings and contact us to request access, correction, export, deletion or account closure. Requests are handled after identity verification under applicable rules. You can revoke Google access in your Google Account third-party connections. Revoking Google access does not automatically delete your Yingxue account or saved creations; contact us separately to request deletion." },
        { title: "7. Updates and contact", body: "Changes are published on this page with an updated date. Material changes to processing purposes or methods will be communicated as applicable requirements provide. For privacy, account closure or data requests, contact the Yingxue operator at the email below." },
    ],
};

const japanese: LegalCopy = {
    privacy: "プライバシーポリシー", terms: "利用規約", home: "ホームに戻る", updated: "更新日", contact: "お問い合わせ",
    loading: "利用規約を読み込み中…", unavailable: "利用規約を読み込めませんでした。再試行してください。", empty: "利用規約はまだ公開されていません。", retry: "再試行",
    intro: "本ポリシーは、映雪の運営者が本サイトのアカウント、AI 制作、ファイル保存、チャージ機能で情報を取り扱う方法を説明します。",
    sections: [
        { title: "1. アカウントと Google ログイン", body: "登録とアカウント管理では、入力されたユーザー名、連絡先、プロフィールを取り扱います。Google ログインで要求する権限は openid、email、profile のみです。Google のアカウント識別子、確認済みメール、名前、画像を受け取り、認証、アカウント作成・識別、プロフィール表示に使用します。Google のパスワード、Gmail、ドライブ内のファイルは取得しません。Google アカウントデータは広告のターゲティング、販売、汎用 AI モデルの学習には使用しません。" },
        { title: "2. 制作・取引・技術情報", body: "各機能では、プロンプト、会話、プロジェクト、キャンバス、アップロード・生成した画像、音声、動画などのファイル、タスク状態、クレジット利用、チャージ記録を処理します。ログイン、安全確保、障害調査のため、必要な IP アドレス、アクセス・エラーログ、ブラウザーや端末情報も処理します。利用権限のある資料のみ送信してください。" },
        { title: "3. 外部サービスと国外での処理", body: "生成、認証、決済、保存、共有時に、対応するモデル、認証、決済、クラウド保存、配信事業者へ必要な情報を送信する場合があります。制作入力は選択したモデルサービスへ送られ、公開共有した内容は訪問者が閲覧できます。事業者や設備が居住国・地域外にある場合があります。選択した機能、安全確保、法的義務に必要な処理に限定し、個人情報は販売しません。外部事業者には各社のポリシーも適用されます。" },
        { title: "4. Cookie とローカル保存", body: "必要なログイン Cookie と、言語、テーマ、制作キャッシュ等のブラウザー保存を使用します。ログアウト、サイトデータの削除、ブラウザー設定で管理できます。削除するとログアウトし、未同期の制作データが失われる場合があります。" },
        { title: "5. 保存と保護", body: "サービス提供に必要な期間保存し、HTTPS やアクセス制御等で保護します。削除や退会の申請は、業務上の参照、バックアップ周期、適用法を考慮して処理します。法令等で必要な取引、安全、紛争対応の記録は保持する場合があります。絶対的な安全は保証できないため、認証情報を適切に管理してください。" },
        { title: "6. 選択と権利", body: "利用可能な設定からプロフィールを確認・変更でき、開示、訂正、エクスポート、削除、退会はお問い合わせください。本人確認後、適用ルールに従って対応します。Google アカウントのサードパーティ接続管理で認可を取り消せますが、映雪のアカウントや保存済み作品は自動削除されません。削除は別途申請してください。" },
        { title: "7. 更新と連絡先", body: "変更は本ページと更新日に反映します。処理目的や方法の重要な変更は、適用要件に従って通知します。プライバシー、退会、データ処理については下記メールで映雪の運営者へご連絡ください。" },
    ],
};

const korean: LegalCopy = {
    privacy: "개인정보 처리방침", terms: "서비스 이용약관", home: "홈으로", updated: "업데이트", contact: "문의",
    loading: "이용약관을 불러오는 중…", unavailable: "이용약관을 불러올 수 없습니다. 다시 시도해 주세요.", empty: "이용약관이 아직 게시되지 않았습니다.", retry: "다시 시도",
    intro: "이 방침은 잉쉐(Yingxue) 운영자가 본 웹사이트의 계정, AI 창작, 파일 저장 및 충전 서비스를 제공하면서 정보를 처리하는 방법을 설명합니다.",
    sections: [
        { title: "1. 계정 및 Google 로그인", body: "계정 등록과 관리에는 제출한 사용자 이름, 연락처와 프로필이 사용됩니다. Google 로그인은 openid, email, profile 권한만 요청하며 Google 계정 식별자, 인증된 이메일, 이름과 프로필 사진을 인증, 플랫폼 계정 생성·식별과 프로필 표시에 사용합니다. Google 비밀번호, Gmail 메일, Google Drive 파일은 수집하지 않습니다. Google 계정 데이터는 맞춤 광고, 판매 또는 범용 AI 모델 학습에 사용하지 않습니다." },
        { title: "2. 창작·거래·기술 정보", body: "해당 기능은 프롬프트, 대화, 프로젝트, 캔버스, 업로드·생성한 이미지, 오디오, 동영상과 기타 파일, 작업 상태, 크레딧 사용 및 충전 기록을 처리합니다. 로그인, 보안과 장애 해결을 위해 필요한 IP 주소, 접근·오류 로그, 브라우저와 기기 정보도 처리합니다. 이용 권한이 있는 자료만 제출해 주세요." },
        { title: "3. 외부 서비스 및 국외 처리", body: "생성, 인증, 결제, 저장 또는 공유 기능은 해당 모델, 인증, 결제, 클라우드 저장 및 콘텐츠 전송 업체에 필요한 정보를 보낼 수 있습니다. 창작 입력은 선택한 모델 서비스로 전송될 수 있고 공개 공유한 콘텐츠는 방문자가 볼 수 있습니다. 일부 업체나 인프라는 거주 국가·지역 밖에 있을 수 있습니다. 선택한 기능, 보안과 법적 의무에 필요한 범위에서 처리하며 개인정보를 판매하지 않습니다. 각 업체의 개인정보 처리방침도 적용됩니다." },
        { title: "4. 쿠키 및 로컬 저장소", body: "필수 로그인 쿠키와 언어, 테마, 창작 캐시 등을 위한 브라우저 저장소를 사용합니다. 로그아웃, 사이트 데이터 삭제 또는 브라우저 설정에서 관리할 수 있습니다. 데이터를 지우면 로그아웃되거나 아직 동기화하지 않은 창작물이 삭제될 수 있습니다." },
        { title: "5. 보관 및 보호", body: "서비스 제공에 필요한 기간 동안 보관하고 HTTPS, 접근 제어 등의 조치로 보호합니다. 콘텐츠 삭제나 계정 해지 요청은 업무상 참조, 백업 주기 및 관련 법률에 따라 처리합니다. 필요한 거래·보안·분쟁 처리 기록은 보관될 수 있습니다. 절대적인 보안을 보장할 수 없으므로 로그인 정보를 안전하게 관리해 주세요." },
        { title: "6. 선택 및 권리", body: "제공되는 계정 설정에서 프로필을 확인·수정하고, 열람·정정·내보내기·삭제 또는 계정 해지를 문의할 수 있습니다. 신원 확인 후 적용 규칙에 따라 처리합니다. Google 계정의 서드 파티 연결 관리에서 권한을 철회할 수 있지만 잉쉐 계정이나 저장한 창작물은 자동으로 삭제되지 않습니다. 삭제는 별도로 요청해 주세요." },
        { title: "7. 변경 및 문의", body: "변경 사항과 업데이트 날짜는 이 페이지에 게시합니다. 처리 목적·방법의 중대한 변경은 관련 요건에 따라 알립니다. 개인정보, 계정 해지 또는 데이터 처리에 관한 문의는 아래 이메일로 운영자에게 보내 주세요." },
    ],
};

const spanish: LegalCopy = {
    privacy: "Política de privacidad", terms: "Términos del servicio", home: "Volver al inicio", updated: "Actualización", contact: "Contacto",
    loading: "Cargando los términos…", unavailable: "No se pudieron cargar los términos. Inténtalo de nuevo.", empty: "Los términos aún no se han publicado.", retry: "Reintentar",
    intro: "Esta política explica cómo el operador de Yingxue trata la información al ofrecer cuentas, creación con IA, almacenamiento de archivos y recargas en este sitio web.",
    sections: [
        { title: "1. Cuentas e inicio con Google", body: "El registro y la gestión de cuentas utilizan el nombre de usuario, los datos de contacto y el perfil que envías. El acceso con Google solicita solo openid, email y profile. Recibimos el identificador de tu cuenta de Google, correo verificado, nombre e imagen para autenticarte, crear o identificar tu cuenta y mostrar el perfil. No recibimos tu contraseña de Google, mensajes de Gmail ni archivos de Google Drive. Los datos de Google no se usan para publicidad dirigida, venta ni entrenamiento de modelos de IA de uso general." },
        { title: "2. Creaciones, transacciones y datos técnicos", body: "Las funciones correspondientes tratan instrucciones, conversaciones, proyectos, lienzos, imágenes, audio, vídeo y otros archivos cargados o generados, además del estado de tareas, uso de créditos y recargas. También se tratan las direcciones IP, registros de acceso y errores e información del navegador y dispositivo necesarios para acceso, seguridad y diagnóstico. Envía solo material que tengas derecho a utilizar." },
        { title: "3. Proveedores y tratamiento internacional", body: "Las funciones de generación, verificación, pago, almacenamiento o uso compartido pueden enviar información necesaria a sus proveedores de modelos, identidad, pagos, nube o distribución de contenido. Las entradas creativas pueden enviarse al modelo elegido; los visitantes pueden ver el contenido que compartas públicamente. Algunos proveedores o infraestructuras pueden estar fuera de tu país o región. Limitamos el tratamiento a las funciones elegidas, la seguridad o las obligaciones legales y no vendemos información personal. También se aplican las políticas de cada proveedor." },
        { title: "4. Cookies y almacenamiento local", body: "El sitio utiliza cookies de acceso necesarias y almacenamiento del navegador para idioma, tema, cachés creativas y otras preferencias o datos. Puedes gestionarlos cerrando sesión, borrando datos del sitio o desde el navegador. Borrar los datos puede cerrar la sesión y eliminar trabajo aún no sincronizado." },
        { title: "5. Conservación y protección", body: "Conservamos la información durante el tiempo necesario para el servicio y aplicamos medidas como HTTPS y controles de acceso. Las solicitudes de eliminación y cierre de cuenta se tramitan considerando las referencias operativas, las copias de seguridad y la ley aplicable. Los registros de transacciones, seguridad o disputas pueden conservarse cuando sea necesario. Ningún servicio garantiza seguridad absoluta; protege tus credenciales." },
        { title: "6. Opciones y derechos", body: "Puedes consultar o modificar el perfil en los ajustes disponibles y solicitar acceso, corrección, exportación, eliminación o cierre de cuenta por correo. Verificamos la identidad y aplicamos las reglas pertinentes. Puedes revocar el acceso en las conexiones de terceros de tu cuenta de Google. Esto no elimina automáticamente tu cuenta de Yingxue ni tus creaciones; solicita la eliminación por separado." },
        { title: "7. Cambios y contacto", body: "Publicamos los cambios en esta página con una fecha actualizada. Los cambios importantes en fines o métodos se comunicarán según los requisitos aplicables. Para privacidad, cierre de cuenta o solicitudes de datos, contacta al operador de Yingxue mediante el correo indicado abajo." },
    ],
};

const portuguese: LegalCopy = {
    privacy: "Política de privacidade", terms: "Termos de serviço", home: "Voltar ao início", updated: "Atualização", contact: "Contato",
    loading: "Carregando os termos…", unavailable: "Não foi possível carregar os termos. Tente novamente.", empty: "Os termos ainda não foram publicados.", retry: "Tentar novamente",
    intro: "Esta política explica como o operador do Yingxue trata informações ao oferecer contas, criação com IA, armazenamento de arquivos e recargas neste site.",
    sections: [
        { title: "1. Contas e login com Google", body: "O cadastro e a gestão da conta utilizam o nome de usuário, os contatos e o perfil enviados. O login com Google solicita apenas openid, email e profile. Recebemos o identificador da conta Google, e-mail verificado, nome e foto para autenticar você, criar ou identificar sua conta e exibir o perfil. Não recebemos sua senha do Google, mensagens do Gmail nem arquivos do Google Drive. Dados da conta Google não são usados para publicidade direcionada, venda ou treinamento de modelos de IA de uso geral." },
        { title: "2. Criações, transações e dados técnicos", body: "As funções correspondentes tratam prompts, conversas, projetos, telas, imagens, áudio, vídeo e outros arquivos enviados ou gerados, além do estado das tarefas, uso de créditos e recargas. Também tratamos os endereços IP, registros de acesso e erros e informações do navegador e dispositivo necessários para login, segurança e diagnóstico. Envie apenas materiais que tenha direito de utilizar." },
        { title: "3. Fornecedores e tratamento internacional", body: "As funções de geração, verificação, pagamento, armazenamento ou compartilhamento podem enviar informações necessárias aos respectivos fornecedores de modelos, identidade, pagamentos, nuvem ou distribuição de conteúdo. As entradas criativas podem ser enviadas ao modelo escolhido; visitantes podem visualizar conteúdo compartilhado publicamente. Alguns fornecedores ou infraestruturas podem estar fora do seu país ou região. Limitamos o tratamento às funções escolhidas, à segurança e às obrigações legais e não vendemos informações pessoais. As políticas dos fornecedores também se aplicam." },
        { title: "4. Cookies e armazenamento local", body: "O site usa cookies de login necessários e armazenamento do navegador para idioma, tema, caches criativos e outras preferências ou dados. Você pode gerenciá-los saindo da conta, apagando os dados do site ou nas configurações do navegador. Apagar os dados pode encerrar sua sessão e remover criações ainda não sincronizadas." },
        { title: "5. Retenção e proteção", body: "Mantemos as informações pelo período necessário ao serviço e adotamos medidas como HTTPS e controles de acesso. Pedidos de exclusão e encerramento de conta são tratados considerando referências operacionais, ciclos de backup e a legislação aplicável. Registros de transações, segurança ou disputas podem ser mantidos quando necessário. Nenhum serviço garante segurança absoluta; proteja suas credenciais." },
        { title: "6. Escolhas e direitos", body: "Você pode consultar ou alterar o perfil nas configurações disponíveis e solicitar acesso, correção, exportação, exclusão ou encerramento da conta por contato. Verificamos a identidade e seguimos as regras aplicáveis. O acesso pode ser revogado nas conexões de terceiros da sua conta Google. Isso não exclui automaticamente a conta Yingxue nem as criações salvas; solicite a exclusão separadamente." },
        { title: "7. Alterações e contato", body: "As alterações são publicadas nesta página com a data atualizada. Mudanças relevantes nas finalidades ou métodos serão comunicadas conforme os requisitos aplicáveis. Para questões de privacidade, encerramento de conta ou dados, entre em contato com o operador do Yingxue pelo e-mail abaixo." },
    ],
};

const french: LegalCopy = {
    privacy: "Politique de confidentialité", terms: "Conditions d’utilisation", home: "Retour à l’accueil", updated: "Mise à jour", contact: "Nous contacter",
    loading: "Chargement des conditions…", unavailable: "Impossible de charger les conditions. Veuillez réessayer.", empty: "Les conditions n’ont pas encore été publiées.", retry: "Réessayer",
    intro: "Cette politique explique comment l’exploitant de Yingxue traite les informations pour fournir les comptes, la création par IA, le stockage de fichiers et les recharges sur ce site.",
    sections: [
        { title: "1. Comptes et connexion avec Google", body: "L’inscription et la gestion du compte utilisent le nom d’utilisateur, les coordonnées et le profil que vous fournissez. La connexion avec Google demande uniquement les autorisations openid, email et profile. Nous recevons votre identifiant de compte Google, votre adresse e-mail vérifiée, votre nom et votre photo pour vous authentifier, créer ou identifier votre compte sur la plateforme et afficher votre profil. Nous ne recevons ni votre mot de passe Google, ni vos messages Gmail, ni vos fichiers Google Drive. Les données du compte Google ne servent pas à la publicité ciblée, à la vente ou à l’entraînement de modèles d’IA à usage général." },
        { title: "2. Données créatives, transactions et données techniques", body: "Les fonctions concernées traitent vos instructions, conversations, projets, canevas, images, fichiers audio, vidéos et autres fichiers importés ou générés, ainsi que l’état des tâches, l’utilisation des crédits et les recharges. Les adresses IP, journaux d’accès et d’erreurs, ainsi que les informations nécessaires sur le navigateur et l’appareil servent à la connexion, à la sécurité et au diagnostic. Importez uniquement des contenus que vous êtes autorisé à utiliser." },
        { title: "3. Prestataires et traitement international", body: "Les fonctions de génération, de vérification, de paiement, de stockage et de partage peuvent transmettre les informations nécessaires aux prestataires correspondants de modèles, d’identité, de paiement, de stockage cloud ou de diffusion de contenu. Les entrées créatives peuvent être envoyées au service de modèle choisi ; les visiteurs peuvent consulter les contenus que vous partagez publiquement. Certains prestataires ou infrastructures peuvent se trouver hors de votre pays ou région. Le traitement se limite aux fonctions choisies, à la sécurité et aux obligations légales ; nous ne vendons pas de données personnelles. Les prestataires appliquent également leurs propres politiques de confidentialité." },
        { title: "4. Cookies et stockage local", body: "Le site utilise les cookies de connexion nécessaires et le stockage du navigateur pour la langue, le thème, les caches créatifs et d’autres préférences ou données. Vous pouvez les gérer en vous déconnectant, en supprimant les données du site ou dans les paramètres du navigateur. La suppression peut fermer votre session et effacer les créations non encore synchronisées." },
        { title: "5. Conservation et protection", body: "Nous conservons les informations pendant la durée nécessaire au service et utilisons notamment HTTPS et des contrôles d’accès. Les demandes de suppression de contenu et de clôture de compte sont traitées en tenant compte des références opérationnelles, des cycles de sauvegarde et du droit applicable. Des données de transaction, de sécurité ou de litige peuvent être conservées lorsque cela est nécessaire. Aucun service en ligne ne garantit une sécurité absolue ; protégez vos identifiants." },
        { title: "6. Vos choix et vos droits", body: "Vous pouvez consulter ou modifier votre profil dans les paramètres disponibles et nous contacter pour demander l’accès, la rectification, l’exportation, la suppression ou la clôture du compte. Les demandes sont traitées après vérification de l’identité selon les règles applicables. Vous pouvez révoquer l’accès dans les connexions tierces de votre compte Google. Cette révocation ne supprime pas automatiquement votre compte Yingxue ni vos créations enregistrées ; contactez-nous séparément pour demander leur suppression." },
        { title: "7. Modifications et contact", body: "Les modifications sont publiées sur cette page avec une date actualisée. Les changements importants des finalités ou méthodes de traitement seront communiqués selon les exigences applicables. Pour toute question de confidentialité, clôture de compte ou demande concernant les données, contactez l’exploitant de Yingxue à l’adresse e-mail ci-dessous." },
    ],
};

const german: LegalCopy = {
    privacy: "Datenschutzerklärung", terms: "Nutzungsbedingungen", home: "Zur Startseite", updated: "Aktualisiert", contact: "Kontakt",
    loading: "Nutzungsbedingungen werden geladen…", unavailable: "Die Nutzungsbedingungen konnten nicht geladen werden. Bitte erneut versuchen.", empty: "Die Nutzungsbedingungen wurden noch nicht veröffentlicht.", retry: "Erneut versuchen",
    intro: "Diese Erklärung beschreibt, wie der Betreiber von Yingxue Informationen verarbeitet, um auf dieser Website Konten, KI-Kreation, Dateispeicherung und Guthabenaufladungen bereitzustellen.",
    sections: [
        { title: "1. Konten und Anmeldung mit Google", body: "Für Registrierung und Kontoverwaltung werden der von Ihnen angegebene Benutzername, Ihre Kontaktdaten und Ihr Profil verarbeitet. Die Google-Anmeldung fordert nur die Berechtigungen openid, email und profile an. Wir erhalten Ihre Google-Konto-ID, bestätigte E-Mail-Adresse, Ihren Namen und Ihr Profilbild, um Sie zu authentifizieren, Ihr Plattformkonto anzulegen oder zuzuordnen und Ihr Profil anzuzeigen. Wir erhalten weder Ihr Google-Passwort noch Gmail-Nachrichten oder Google-Drive-Dateien. Google-Kontodaten werden nicht für gezielte Werbung, zum Verkauf oder zum Training allgemein einsetzbarer KI-Modelle verwendet." },
        { title: "2. Kreative Inhalte, Transaktionen und technische Daten", body: "Die jeweiligen Funktionen verarbeiten Ihre Prompts, Gespräche, Projekte, Arbeitsflächen, hochgeladenen und erzeugten Bilder, Audio-, Video- und sonstigen Dateien sowie Aufgabenstatus, Kreditverbrauch und Aufladungen. Erforderliche IP-Adressen, Zugriffs- und Fehlerprotokolle sowie Browser- und Geräteinformationen dienen der Anmeldung, Sicherheit und Fehlerbehebung. Laden Sie nur Inhalte hoch, zu deren Nutzung Sie berechtigt sind." },
        { title: "3. Dienstleister und internationale Verarbeitung", body: "Generierung, Verifizierung, Zahlung, Speicherung und Freigabe können erforderliche Informationen an die jeweiligen Modell-, Identitäts-, Zahlungs-, Cloudspeicher- oder Inhaltsverteilungsanbieter übermitteln. Kreative Eingaben können an den gewählten Modelldienst gesendet werden; Besucher können öffentlich freigegebene Inhalte ansehen. Einige Anbieter oder Infrastrukturen befinden sich möglicherweise außerhalb Ihres Landes oder Ihrer Region. Die Verarbeitung erfolgt für die gewählten Funktionen, die Sicherheit oder gesetzliche Pflichten. Wir verkaufen keine personenbezogenen Daten. Für Anbieter gelten zusätzlich deren eigene Datenschutzrichtlinien." },
        { title: "4. Cookies und lokaler Speicher", body: "Die Website verwendet notwendige Anmelde-Cookies und Browserspeicher für Sprache, Design, kreative Zwischenspeicher sowie weitere Einstellungen oder Daten. Sie können diese durch Abmeldung, Löschen der Websitedaten oder die Browsereinstellungen verwalten. Das Löschen kann Sie abmelden und noch nicht synchronisierte Arbeiten entfernen." },
        { title: "5. Aufbewahrung und Schutz", body: "Wir bewahren Informationen für den zur Bereitstellung der Dienste erforderlichen Zeitraum auf und setzen unter anderem HTTPS und Zugriffskontrollen ein. Anträge auf Inhaltslöschung und Kontoschließung werden unter Berücksichtigung betrieblicher Verknüpfungen, Sicherungszyklen und geltenden Rechts bearbeitet. Transaktions-, Sicherheits- oder Streitfalldaten können bei Bedarf weiter aufbewahrt werden. Kein Onlinedienst kann absolute Sicherheit garantieren; schützen Sie Ihre Zugangsdaten." },
        { title: "6. Ihre Wahlmöglichkeiten und Rechte", body: "Sie können Profildaten in den verfügbaren Kontoeinstellungen ansehen oder ändern und uns für Auskunft, Berichtigung, Export, Löschung oder Kontoschließung kontaktieren. Anträge werden nach Identitätsprüfung gemäß den geltenden Regeln bearbeitet. Den Google-Zugriff können Sie in den Drittanbieter-Verbindungen Ihres Google-Kontos widerrufen. Dadurch werden Ihr Yingxue-Konto und gespeicherte Arbeiten nicht automatisch gelöscht; beantragen Sie deren Löschung gesondert bei uns." },
        { title: "7. Änderungen und Kontakt", body: "Änderungen werden auf dieser Seite mit aktualisiertem Datum veröffentlicht. Wesentliche Änderungen der Verarbeitungszwecke oder -methoden werden entsprechend den geltenden Anforderungen mitgeteilt. Bei Fragen zum Datenschutz, zur Kontoschließung oder zu Ihren Daten wenden Sie sich an den Betreiber von Yingxue unter der unten angegebenen E-Mail-Adresse." },
    ],
};

export const legalCopy = {
    "zh-CN": simplified, "zh-HK": traditional, "zh-TW": traditional, "en-US": english,
    "ja-JP": japanese, "ko-KR": korean, "es-ES": spanish, "pt-BR": portuguese,
    "fr-FR": french, "de-DE": german,
} satisfies Record<InterfaceLocale, LegalCopy>;
